package main

import (
	"errors"
	"fmt"
	"math/big"
)

var (
	one        = big.NewInt(1)
	two256     = new(big.Int).Lsh(big.NewInt(1), 256)
	maxUint256 = new(big.Int).Sub(new(big.Int).Set(two256), one)
)

type Block struct {
	Height     int64
	Timestamp  int64
	Target     *big.Int
	Difficulty *big.Int
}

type Algorithm interface {
	Name() string
	NextTarget(chain []Block, candidateTimestamp int64) (*big.Int, error)
}

type Limits struct {
	MinTarget *big.Int
	MaxTarget *big.Int
}

func clampTarget(target *big.Int, limits Limits) *big.Int {
	if target.Sign() <= 0 || (limits.MinTarget != nil && target.Cmp(limits.MinTarget) < 0) {
		if limits.MinTarget != nil {
			return new(big.Int).Set(limits.MinTarget)
		}
		return new(big.Int).Set(one)
	}
	if target.Cmp(limits.MaxTarget) > 0 {
		return new(big.Int).Set(limits.MaxTarget)
	}
	return target
}

func targetToDifficulty(maxTarget, target *big.Int) *big.Int {
	if target.Sign() <= 0 {
		return new(big.Int).Set(maxUint256)
	}
	d := new(big.Int).Div(new(big.Int).Set(maxTarget), target)
	if d.Sign() == 0 {
		d.SetInt64(1)
	}
	return d
}

type ASERT struct {
	TargetSeconds int64
	HalfLife      int64
	AnchorHeight  int64
	AnchorTime    int64
	AnchorTarget  *big.Int
	Limits        Limits
}

func (a ASERT) Name() string {
	return fmt.Sprintf("asert-%ds-hl%d", a.TargetSeconds, a.HalfLife)
}

func floorDiv(n, d int64) int64 {
	q, r := n/d, n%d
	if r != 0 && ((r < 0) != (d < 0)) {
		q--
	}
	return q
}

func (a ASERT) NextTarget(chain []Block, candidateTimestamp int64) (*big.Int, error) {
	if len(chain) == 0 {
		return nil, errors.New("empty chain")
	}
	parent := chain[len(chain)-1]
	if candidateTimestamp <= parent.Timestamp {
		return nil, errors.New("candidate timestamp must exceed parent timestamp")
	}
	if a.TargetSeconds <= 0 || a.HalfLife <= 0 || a.AnchorTarget == nil || a.AnchorTarget.Sign() <= 0 {
		return nil, errors.New("invalid ASERT configuration")
	}
	candidateHeight := parent.Height + 1
	heightDelta := candidateHeight - a.AnchorHeight
	timeDelta := candidateTimestamp - a.AnchorTime
	scheduleError := timeDelta - a.TargetSeconds*heightDelta
	if scheduleError >= 256*a.HalfLife {
		return new(big.Int).Set(a.Limits.MaxTarget), nil
	}
	if scheduleError <= -256*a.HalfLife {
		return clampTarget(new(big.Int).Set(one), a.Limits), nil
	}
	exponent := floorDiv(scheduleError*65536, a.HalfLife)
	shifts := floorDiv(exponent, 65536)
	frac := exponent - shifts*65536

	f := big.NewInt(frac)
	f2 := new(big.Int).Mul(f, f)
	f3 := new(big.Int).Mul(f2, f)
	poly := new(big.Int).Mul(big.NewInt(195766423245049), f)
	poly.Add(poly, new(big.Int).Mul(big.NewInt(971821376), f2))
	poly.Add(poly, new(big.Int).Mul(big.NewInt(5127), f3))
	poly.Add(poly, new(big.Int).Lsh(big.NewInt(1), 47))
	poly.Rsh(poly, 48)
	factor := new(big.Int).Add(big.NewInt(65536), poly)

	target := new(big.Int).Mul(new(big.Int).Set(a.AnchorTarget), factor)
	shifts -= 16
	if shifts < 0 {
		target.Rsh(target, uint(-shifts))
	} else {
		target.Lsh(target, uint(shifts))
	}
	return clampTarget(target, a.Limits), nil
}

type EthashControl struct {
	MaxTarget     *big.Int
	MinTarget     *big.Int
	MinDifficulty *big.Int
}

func (e EthashControl) Name() string { return "ethash-eip100-control" }

func (e EthashControl) NextTarget(chain []Block, candidateTimestamp int64) (*big.Int, error) {
	if len(chain) == 0 {
		return nil, errors.New("empty chain")
	}
	parent := chain[len(chain)-1]
	if candidateTimestamp <= parent.Timestamp {
		return nil, errors.New("candidate timestamp must exceed parent timestamp")
	}
	delta := candidateTimestamp - parent.Timestamp
	adjustmentFactor := int64(1) - delta/9
	if adjustmentFactor < -99 {
		adjustmentFactor = -99
	}
	step := new(big.Int).Div(new(big.Int).Set(parent.Difficulty), big.NewInt(2048))
	step.Mul(step, big.NewInt(adjustmentFactor))
	nextDifficulty := new(big.Int).Add(new(big.Int).Set(parent.Difficulty), step)
	if nextDifficulty.Cmp(e.MinDifficulty) < 0 {
		nextDifficulty.Set(e.MinDifficulty)
	}
	target := new(big.Int).Div(new(big.Int).Set(e.MaxTarget), nextDifficulty)
	return clampTarget(target, Limits{MinTarget: e.MinTarget, MaxTarget: e.MaxTarget}), nil
}

type LWMA struct {
	TargetSeconds int64
	Window        int
	AnchorTarget  *big.Int
	Limits        Limits
}

func (l LWMA) Name() string {
	return fmt.Sprintf("lwma-%ds-n%d", l.TargetSeconds, l.Window)
}

func (l LWMA) NextTarget(chain []Block, candidateTimestamp int64) (*big.Int, error) {
	if len(chain) == 0 {
		return nil, errors.New("empty chain")
	}
	if candidateTimestamp <= chain[len(chain)-1].Timestamp {
		return nil, errors.New("candidate timestamp must exceed parent timestamp")
	}
	if l.TargetSeconds <= 0 || l.Window < 2 || l.AnchorTarget == nil {
		return nil, errors.New("invalid LWMA configuration")
	}
	if len(chain) < l.Window+1 {
		return new(big.Int).Set(l.AnchorTarget), nil
	}
	start := len(chain) - l.Window - 1
	weightedSolve := int64(0)
	targetSum := new(big.Int)
	for i := 1; i <= l.Window; i++ {
		solve := chain[start+i].Timestamp - chain[start+i-1].Timestamp
		if solve < 1 {
			solve = 1
		}
		if solve > 6*l.TargetSeconds {
			solve = 6 * l.TargetSeconds
		}
		weightedSolve += int64(i) * solve
		targetSum.Add(targetSum, chain[start+i].Target)
	}
	averageTarget := new(big.Int).Div(targetSum, big.NewInt(int64(l.Window)))
	k := int64(l.Window*(l.Window+1)) * l.TargetSeconds / 2
	next := new(big.Int).Mul(averageTarget, big.NewInt(weightedSolve))
	next.Div(next, big.NewInt(k))
	return clampTarget(next, l.Limits), nil
}
