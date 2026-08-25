package main

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math"
	"math/big"
	"math/rand"
	"sort"
)

type Scenario struct {
	Name       string
	Blocks     int
	Transition int
	Kind       string
	FactorA    float64
	FactorB    float64
	Period     int
	Timestamp  string
}

func (s Scenario) HashFactor(height int) float64 {
	switch s.Kind {
	case "step":
		if height >= s.Transition {
			return s.FactorB
		}
		return s.FactorA
	case "switch":
		if ((height-s.Transition)/s.Period)%2 == 0 {
			return s.FactorA
		}
		return s.FactorB
	case "linear":
		progress := float64(height) / float64(maxInt(1, s.Blocks-1))
		return s.FactorA + (s.FactorB-s.FactorA)*progress
	case "exponential":
		progress := float64(height) / float64(maxInt(1, s.Blocks-1))
		return s.FactorA * math.Pow(s.FactorB/s.FactorA, progress)
	default:
		return s.FactorA
	}
}

type RunResult struct {
	Algorithm                  string
	TargetSeconds              int64
	Scenario                   string
	Seed                       int64
	Blocks                     int
	MeanInterval               float64
	MedianInterval             float64
	P95Interval                float64
	P99Interval                float64
	LongestInterval            float64
	BurstRate                  float64
	DifficultyCV               float64
	FinalDifficultyRatio       float64
	RecoverySeconds            float64
	TimestampOffsetMean        float64
	TimestampOffsetMaximum     float64
	SwitchRevenuePerHashSecond float64
	DeterministicTraceSHA256   string
}

type simulatedChain struct {
	blocks     []Block
	actualTime float64
	intervals  []float64
	diffRatios []float64
	offsets    []float64
	work       *big.Int
}

func seedFor(base int64, scenario string) int64 {
	digest := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", base, scenario)))
	return int64(binary.LittleEndian.Uint64(digest[:8]) & math.MaxInt64)
}

func initialChain(anchorTarget, maxTarget *big.Int) simulatedChain {
	difficulty := targetToDifficulty(maxTarget, anchorTarget)
	return simulatedChain{
		blocks: []Block{{Height: 0, Timestamp: 0, Target: new(big.Int).Set(anchorTarget), Difficulty: difficulty}},
		work:   new(big.Int).Set(difficulty),
	}
}

func simulate(algorithm Algorithm, scenario Scenario, targetSeconds int64, anchorTarget, maxTarget *big.Int, baseSeed int64) (RunResult, error) {
	seed := seedFor(baseSeed, scenario.Name)
	rng := rand.New(rand.NewSource(seed))
	chain := initialChain(anchorTarget, maxTarget)
	hasher := sha256.New()
	recoveryStartActual := 0.0
	recoverySeconds := 0.0
	recoveryRun := 0
	renterBlocks := 0.0
	renterHashSeconds := 0.0

	for height := 1; height <= scenario.Blocks; height++ {
		factor := scenario.HashFactor(height)
		probeTime := chain.blocks[len(chain.blocks)-1].Timestamp + targetSeconds
		workTarget, err := algorithm.NextTarget(chain.blocks, probeTime)
		if err != nil {
			return RunResult{}, err
		}
		difficultyRatio := ratio(anchorTarget, workTarget)
		mean := float64(targetSeconds) * difficultyRatio / factor
		u := rng.Float64()
		if u == 0 {
			u = math.SmallestNonzeroFloat64
		}
		interval := -math.Log1p(-u) * mean
		if interval < 0.001 {
			interval = 0.001
		}
		chain.actualTime += interval
		honestTime := int64(math.Ceil(chain.actualTime))
		parentTime := chain.blocks[len(chain.blocks)-1].Timestamp
		reported := honestTime
		switch scenario.Timestamp {
		case "future-15":
			reported = honestTime + 15
		case "minimum":
			reported = parentTime + 1
		case "minority-future":
			if height%10 < 3 {
				reported = honestTime + 15
			}
		}
		if reported <= parentTime {
			reported = parentTime + 1
		}
		wait := enforceFutureLimit(&chain.actualTime, reported, 15)
		interval += wait
		target, err := algorithm.NextTarget(chain.blocks, reported)
		if err != nil {
			return RunResult{}, err
		}
		difficulty := targetToDifficulty(maxTarget, target)
		chain.blocks = append(chain.blocks, Block{Height: int64(height), Timestamp: reported, Target: target, Difficulty: difficulty})
		chain.work.Add(chain.work, difficulty)
		chain.intervals = append(chain.intervals, interval)
		currentDiffRatio := ratio(anchorTarget, target)
		chain.diffRatios = append(chain.diffRatios, currentDiffRatio)
		chain.offsets = append(chain.offsets, float64(reported)-chain.actualTime)
		fmt.Fprintf(hasher, "%d,%d,%s\n", height, reported, target.String())

		if scenario.Transition > 0 && height == scenario.Transition {
			recoveryStartActual = chain.actualTime
		}
		if scenario.Transition > 0 && height >= scenario.Transition {
			ideal := scenario.HashFactor(height)
			if math.Abs(currentDiffRatio-ideal)/ideal <= 0.10 {
				recoveryRun++
				if recoveryRun >= 12 && recoverySeconds == 0 {
					recoverySeconds = chain.actualTime - recoveryStartActual
				}
			} else {
				recoveryRun = 0
			}
		}
		if scenario.Kind == "switch" && factor > 1 {
			renterBlocks += 1 - 1/factor
			renterHashSeconds += (factor - 1) * interval
		}
	}

	mean, median, p95, p99, longest := intervalStats(chain.intervals)
	result := RunResult{
		Algorithm:                algorithm.Name(),
		TargetSeconds:            targetSeconds,
		Scenario:                 scenario.Name,
		Seed:                     seed,
		Blocks:                   scenario.Blocks,
		MeanInterval:             mean,
		MedianInterval:           median,
		P95Interval:              p95,
		P99Interval:              p99,
		LongestInterval:          longest,
		BurstRate:                burstRate(chain.intervals, float64(targetSeconds)/4),
		DifficultyCV:             coefficientOfVariation(chain.diffRatios),
		FinalDifficultyRatio:     chain.diffRatios[len(chain.diffRatios)-1],
		RecoverySeconds:          recoverySeconds,
		TimestampOffsetMean:      average(chain.offsets),
		TimestampOffsetMaximum:   maxFloat(chain.offsets),
		DeterministicTraceSHA256: fmt.Sprintf("%x", hasher.Sum(nil)),
	}
	if renterHashSeconds > 0 {
		result.SwitchRevenuePerHashSecond = renterBlocks / renterHashSeconds
	}
	return result, nil
}

type PartitionResult struct {
	Algorithm       string
	TargetSeconds   int64
	Split           string
	DurationSeconds float64
	BranchABlocks   int
	BranchBBlocks   int
	BranchAWork     string
	BranchBWork     string
	WinningBranch   string
}

func simulateUntil(algorithm Algorithm, targetSeconds int64, factor, duration float64, anchorTarget, maxTarget *big.Int, seed int64) (simulatedChain, error) {
	rng := rand.New(rand.NewSource(seed))
	chain := initialChain(anchorTarget, maxTarget)
	for chain.actualTime < duration {
		probe := chain.blocks[len(chain.blocks)-1].Timestamp + targetSeconds
		workTarget, err := algorithm.NextTarget(chain.blocks, probe)
		if err != nil {
			return chain, err
		}
		mean := float64(targetSeconds) * ratio(anchorTarget, workTarget) / factor
		interval := -math.Log1p(-rng.Float64()) * mean
		if interval < 0.001 {
			interval = 0.001
		}
		chain.actualTime += interval
		reported := int64(math.Ceil(chain.actualTime))
		if reported <= chain.blocks[len(chain.blocks)-1].Timestamp {
			reported = chain.blocks[len(chain.blocks)-1].Timestamp + 1
		}
		interval += enforceFutureLimit(&chain.actualTime, reported, 15)
		target, err := algorithm.NextTarget(chain.blocks, reported)
		if err != nil {
			return chain, err
		}
		difficulty := targetToDifficulty(maxTarget, target)
		chain.blocks = append(chain.blocks, Block{Height: int64(len(chain.blocks)), Timestamp: reported, Target: target, Difficulty: difficulty})
		chain.work.Add(chain.work, difficulty)
	}
	return chain, nil
}

func simulatePartition(algorithm Algorithm, targetSeconds int64, shareA float64, anchorTarget, maxTarget *big.Int, baseSeed int64) (PartitionResult, error) {
	duration := 3600.0
	a, err := simulateUntil(algorithm, targetSeconds, shareA, duration, anchorTarget, maxTarget, seedFor(baseSeed, fmt.Sprintf("partition-a-%.2f", shareA)))
	if err != nil {
		return PartitionResult{}, err
	}
	b, err := simulateUntil(algorithm, targetSeconds, 1-shareA, duration, anchorTarget, maxTarget, seedFor(baseSeed, fmt.Sprintf("partition-b-%.2f", shareA)))
	if err != nil {
		return PartitionResult{}, err
	}
	winner := "A"
	if b.work.Cmp(a.work) > 0 {
		winner = "B"
	}
	return PartitionResult{
		Algorithm: algorithm.Name(), TargetSeconds: targetSeconds,
		Split:           fmt.Sprintf("%.0f/%.0f", shareA*100, (1-shareA)*100),
		DurationSeconds: duration, BranchABlocks: len(a.blocks) - 1, BranchBBlocks: len(b.blocks) - 1,
		BranchAWork: a.work.String(), BranchBWork: b.work.String(), WinningBranch: winner,
	}, nil
}

func ratio(numerator, denominator *big.Int) float64 {
	n := new(big.Float).SetInt(numerator)
	d := new(big.Float).SetInt(denominator)
	v, _ := new(big.Float).Quo(n, d).Float64()
	return v
}

func enforceFutureLimit(actualTime *float64, reported int64, limit int64) float64 {
	earliestActual := float64(reported - limit)
	if *actualTime >= earliestActual {
		return 0
	}
	wait := earliestActual - *actualTime
	*actualTime = earliestActual
	return wait
}

func intervalStats(values []float64) (float64, float64, float64, float64, float64) {
	copyValues := append([]float64(nil), values...)
	sort.Float64s(copyValues)
	return average(values), percentile(copyValues, .50), percentile(copyValues, .95), percentile(copyValues, .99), copyValues[len(copyValues)-1]
}

func percentile(sorted []float64, p float64) float64 {
	index := int(math.Ceil(p*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func coefficientOfVariation(values []float64) float64 {
	mean := average(values)
	if mean == 0 {
		return 0
	}
	squares := 0.0
	for _, value := range values {
		delta := value - mean
		squares += delta * delta
	}
	return math.Sqrt(squares/float64(len(values))) / mean
}

func burstRate(values []float64, threshold float64) float64 {
	count := 0
	for _, value := range values {
		if value <= threshold {
			count++
		}
	}
	return float64(count) / float64(len(values))
}

func maxFloat(values []float64) float64 {
	maximum := -math.MaxFloat64
	for _, value := range values {
		if value > maximum {
			maximum = value
		}
	}
	return maximum
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
