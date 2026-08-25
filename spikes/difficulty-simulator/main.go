package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"sort"
)

type Report struct {
	SchemaVersion string
	Seed          int64
	GoVersion     string
	Model         string
	Runs          []RunResult
	Partitions    []PartitionResult
	Summary       ReportSummary
}

type ReportSummary struct {
	StableRuns      int
	ShockRuns       int
	PartitionRuns   int
	Algorithms      []string
	AcceptanceNotes []string
}

type configuration struct {
	target int64
	build  func(anchorTarget, maxTarget, minTarget *big.Int) Algorithm
}

func main() {
	out := flag.String("out", "difficulty-simulation-report.json", "output JSON path")
	seed := flag.Int64("seed", 20260825, "base deterministic seed")
	quick := flag.Bool("quick", false, "run a reduced matrix for development")
	flag.Parse()

	maxTarget := new(big.Int).Lsh(big.NewInt(1), 240)
	anchorTarget := new(big.Int).Div(new(big.Int).Set(maxTarget), big.NewInt(1_000_000))
	minTarget := new(big.Int).Div(new(big.Int).Set(maxTarget), big.NewInt(1_000_000_000_000))
	configs := configurations()
	scenarioSet := scenarios(*quick)
	report := Report{
		SchemaVersion: "0.1.0",
		Seed:          *seed,
		GoVersion:     runtime.Version(),
		Model:         "discrete-block Monte Carlo; floating point only for non-consensus sampling and metrics",
	}
	algorithmNames := map[string]bool{}

	for _, config := range configs {
		algorithm := config.build(anchorTarget, maxTarget, minTarget)
		algorithmNames[algorithm.Name()] = true
		for _, scenario := range scenarioSet {
			result, err := simulate(algorithm, scenario, config.target, anchorTarget, maxTarget, *seed)
			if err != nil {
				fatal(err)
			}
			report.Runs = append(report.Runs, result)
			if scenario.Name == "stable" {
				report.Summary.StableRuns++
			}
			if scenario.Kind == "step" {
				report.Summary.ShockRuns++
			}
		}
		for _, split := range []float64{.5, .7, .9} {
			result, err := simulatePartition(algorithm, config.target, split, anchorTarget, maxTarget, *seed)
			if err != nil {
				fatal(err)
			}
			report.Partitions = append(report.Partitions, result)
		}
	}
	for name := range algorithmNames {
		report.Summary.Algorithms = append(report.Summary.Algorithms, name)
	}
	sort.Strings(report.Summary.Algorithms)
	report.Summary.PartitionRuns = len(report.Partitions)
	report.Summary.AcceptanceNotes = []string{
		"Simulation is evidence for a disposable-network candidate, not production activation.",
		"Consensus calculators use integer arithmetic; floating point is limited to stochastic sampling and report metrics.",
		"Multi-host 5/10/15-second trials remain required before L1-001 or L1-003 can close.",
	}

	parent := filepath.Dir(*out)
	if parent != "." {
		if err := os.MkdirAll(parent, 0755); err != nil {
			fatal(err)
		}
	}
	payload, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fatal(err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(*out, payload, 0644); err != nil {
		fatal(err)
	}
	fmt.Printf("Wrote %d scenario runs and %d partition runs to %s\n", len(report.Runs), len(report.Partitions), *out)
}

func configurations() []configuration {
	var configs []configuration
	for _, target := range []int64{5, 10, 15} {
		t := target
		configs = append(configs, configuration{target: t, build: func(anchor, max, min *big.Int) Algorithm {
			return EthashControl{MaxTarget: max, MinTarget: min, MinDifficulty: big.NewInt(1)}
		}})
		for _, window := range []int{30, 60, 90} {
			w := window
			configs = append(configs, configuration{target: t, build: func(anchor, max, min *big.Int) Algorithm {
				return LWMA{TargetSeconds: t, Window: w, AnchorTarget: anchor, Limits: Limits{MinTarget: min, MaxTarget: max}}
			}})
		}
		for _, halfLife := range []int64{1800, 3600, 7200} {
			h := halfLife
			configs = append(configs, configuration{target: t, build: func(anchor, max, min *big.Int) Algorithm {
				return ASERT{TargetSeconds: t, HalfLife: h, AnchorHeight: 0, AnchorTime: 0, AnchorTarget: anchor, Limits: Limits{MinTarget: min, MaxTarget: max}}
			}})
		}
	}
	return configs
}

func scenarios(quick bool) []Scenario {
	stableBlocks, otherBlocks := 100000, 15000
	if quick {
		stableBlocks, otherBlocks = 2000, 1200
	}
	transition := 2000
	if quick {
		transition = 200
	}
	return []Scenario{
		{Name: "stable", Blocks: stableBlocks, Kind: "stable", FactorA: 1, Timestamp: "honest"},
		{Name: "step-up-2x", Blocks: otherBlocks, Transition: transition, Kind: "step", FactorA: 1, FactorB: 2, Timestamp: "honest"},
		{Name: "step-up-10x", Blocks: otherBlocks, Transition: transition, Kind: "step", FactorA: 1, FactorB: 10, Timestamp: "honest"},
		{Name: "step-up-100x", Blocks: otherBlocks, Transition: transition, Kind: "step", FactorA: 1, FactorB: 100, Timestamp: "honest"},
		{Name: "step-down-50pct", Blocks: otherBlocks, Transition: transition, Kind: "step", FactorA: 1, FactorB: .5, Timestamp: "honest"},
		{Name: "step-down-90pct", Blocks: otherBlocks, Transition: transition, Kind: "step", FactorA: 1, FactorB: .1, Timestamp: "honest"},
		{Name: "step-down-99pct", Blocks: otherBlocks, Transition: transition, Kind: "step", FactorA: 1, FactorB: .01, Timestamp: "honest"},
		{Name: "switch-rental-10x", Blocks: otherBlocks, Kind: "switch", FactorA: 1, FactorB: 10, Period: 250, Timestamp: "honest"},
		{Name: "gradual-linear-up", Blocks: otherBlocks, Kind: "linear", FactorA: .25, FactorB: 4, Timestamp: "honest"},
		{Name: "gradual-exponential-down", Blocks: otherBlocks, Kind: "exponential", FactorA: 4, FactorB: .25, Timestamp: "honest"},
		{Name: "timestamp-future-15", Blocks: otherBlocks, Kind: "stable", FactorA: 1, Timestamp: "future-15"},
		{Name: "timestamp-minimum", Blocks: otherBlocks, Kind: "stable", FactorA: 1, Timestamp: "minimum"},
		{Name: "timestamp-minority-future", Blocks: otherBlocks, Kind: "stable", FactorA: 1, Timestamp: "minority-future"},
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
