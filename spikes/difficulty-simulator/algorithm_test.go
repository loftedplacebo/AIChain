package main

import (
	"encoding/json"
	"math/big"
	"os"
	"testing"
)

func testTargets() (*big.Int, *big.Int) {
	max := new(big.Int).Lsh(big.NewInt(1), 240)
	anchor := new(big.Int).Div(new(big.Int).Set(max), big.NewInt(1_000_000))
	return anchor, max
}

func TestASERTScheduleAndHalfLife(t *testing.T) {
	anchor, max := testTargets()
	for _, test := range []struct {
		name                   string
		parentHeight, time     int64
		numerator, denominator int64
	}{
		{"on-schedule", 0, 10, 1, 1},
		{"one-half-life-late", 0, 3610, 2, 1},
		{"one-half-life-early", 360, 10, 1, 2},
	} {
		algorithm := ASERT{TargetSeconds: 10, HalfLife: 3600, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}}
		chain := initialChain(anchor, max).blocks
		chain[0].Height = test.parentHeight
		target, err := algorithm.NextTarget(chain, test.time)
		if err != nil {
			t.Fatal(err)
		}
		want := new(big.Int).Mul(new(big.Int).Set(anchor), big.NewInt(test.numerator))
		want.Div(want, big.NewInt(test.denominator))
		if target.Cmp(want) != 0 {
			t.Fatalf("%s: have %s want %s", test.name, target, want)
		}
	}
}

func TestASERTBoundsAndInvalidTimestamp(t *testing.T) {
	anchor, max := testTargets()
	algorithm := ASERT{TargetSeconds: 10, HalfLife: 3600, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}}
	chain := initialChain(anchor, max).blocks
	if _, err := algorithm.NextTarget(chain, 0); err == nil {
		t.Fatal("expected non-increasing timestamp rejection")
	}
	target, err := algorithm.NextTarget(chain, 1_000_000)
	if err != nil {
		t.Fatal(err)
	}
	if target.Cmp(max) != 0 {
		t.Fatalf("late target not saturated: %s", target)
	}
	algorithm.AnchorTime = 1_000_000
	target, err = algorithm.NextTarget(chain, 1)
	if err != nil {
		t.Fatal(err)
	}
	if target.Cmp(one) != 0 {
		t.Fatalf("early target not saturated: %s", target)
	}
}

func TestEthashControlMatchesEIP100NoUncles(t *testing.T) {
	anchor, max := testTargets()
	chain := initialChain(anchor, max).blocks
	algorithm := EthashControl{MaxTarget: max, MinDifficulty: big.NewInt(1)}
	target, err := algorithm.NextTarget(chain, 8)
	if err != nil {
		t.Fatal(err)
	}
	have := targetToDifficulty(max, target)
	parent := chain[0].Difficulty
	want := new(big.Int).Add(parent, new(big.Int).Div(new(big.Int).Set(parent), big.NewInt(2048)))
	if have.Cmp(want) != 0 {
		t.Fatalf("have difficulty %s want %s", have, want)
	}
}

func TestLWMARespondsToFastAndSlowWindows(t *testing.T) {
	anchor, max := testTargets()
	algorithm := LWMA{TargetSeconds: 10, Window: 5, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}}
	fast := initialChain(anchor, max).blocks
	slow := initialChain(anchor, max).blocks
	for i := 1; i <= 6; i++ {
		fast = append(fast, Block{Height: int64(i), Timestamp: int64(i), Target: new(big.Int).Set(anchor), Difficulty: targetToDifficulty(max, anchor)})
		slow = append(slow, Block{Height: int64(i), Timestamp: int64(i * 60), Target: new(big.Int).Set(anchor), Difficulty: targetToDifficulty(max, anchor)})
	}
	fastTarget, err := algorithm.NextTarget(fast, 7)
	if err != nil {
		t.Fatal(err)
	}
	slowTarget, err := algorithm.NextTarget(slow, 361)
	if err != nil {
		t.Fatal(err)
	}
	if fastTarget.Cmp(anchor) >= 0 {
		t.Fatalf("fast window should raise difficulty: %s", fastTarget)
	}
	if slowTarget.Cmp(anchor) <= 0 {
		t.Fatalf("slow window should lower difficulty: %s", slowTarget)
	}
}

func TestASERTBranchIndependence(t *testing.T) {
	anchor, max := testTargets()
	algorithm := ASERT{TargetSeconds: 10, HalfLife: 3600, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}}
	a := initialChain(anchor, max).blocks
	b := initialChain(anchor, max).blocks
	a = append(a, Block{Height: 1, Timestamp: 8, Target: anchor, Difficulty: targetToDifficulty(max, anchor)})
	b = append(b, Block{Height: 1, Timestamp: 20, Target: anchor, Difficulty: targetToDifficulty(max, anchor)})
	ta, err := algorithm.NextTarget(a, 30)
	if err != nil {
		t.Fatal(err)
	}
	tb, err := algorithm.NextTarget(b, 30)
	if err != nil {
		t.Fatal(err)
	}
	if ta.Cmp(tb) != 0 {
		t.Fatalf("same anchor/height/time diverged across branches: %s vs %s", ta, tb)
	}
}

func TestCommittedASERTVectors(t *testing.T) {
	var vectorSet struct {
		TargetSeconds int64
		HalfLife      int64
		AnchorHeight  int64
		AnchorTime    int64
		AnchorTarget  string
		MinTarget     string
		MaxTarget     string
		Vectors       []struct {
			Name               string
			CandidateHeight    int64
			CandidateTimestamp int64
			ExpectedTarget     string
		}
	}
	payload, err := os.ReadFile("testdata/asert_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(payload, &vectorSet); err != nil {
		t.Fatal(err)
	}
	parse := func(value string) *big.Int {
		result, ok := new(big.Int).SetString(value, 10)
		if !ok {
			t.Fatalf("invalid integer %q", value)
		}
		return result
	}
	anchor := parse(vectorSet.AnchorTarget)
	limits := Limits{MinTarget: parse(vectorSet.MinTarget), MaxTarget: parse(vectorSet.MaxTarget)}
	algorithm := ASERT{
		TargetSeconds: vectorSet.TargetSeconds,
		HalfLife:      vectorSet.HalfLife,
		AnchorHeight:  vectorSet.AnchorHeight,
		AnchorTime:    vectorSet.AnchorTime,
		AnchorTarget:  anchor,
		Limits:        limits,
	}
	for _, vector := range vectorSet.Vectors {
		chain := initialChain(anchor, limits.MaxTarget).blocks
		chain[0].Height = vector.CandidateHeight - 1
		target, err := algorithm.NextTarget(chain, vector.CandidateTimestamp)
		if err != nil {
			t.Fatalf("%s: %v", vector.Name, err)
		}
		expected := parse(vector.ExpectedTarget)
		if target.Cmp(expected) != 0 {
			t.Fatalf("%s: have %s want %s", vector.Name, target, expected)
		}
	}
}
