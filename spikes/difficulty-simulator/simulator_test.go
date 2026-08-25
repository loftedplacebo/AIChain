package main

import (
	"math/big"
	"testing"
)

func TestSimulationIsDeterministic(t *testing.T) {
	anchor, max := testTargets()
	algorithm := ASERT{TargetSeconds: 10, HalfLife: 3600, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}}
	scenario := Scenario{Name: "determinism", Blocks: 1000, Kind: "stable", FactorA: 1, Timestamp: "honest"}
	a, err := simulate(algorithm, scenario, 10, anchor, max, 42)
	if err != nil {
		t.Fatal(err)
	}
	b, err := simulate(algorithm, scenario, 10, anchor, max, 42)
	if err != nil {
		t.Fatal(err)
	}
	if a.DeterministicTraceSHA256 != b.DeterministicTraceSHA256 {
		t.Fatalf("trace mismatch: %s vs %s", a.DeterministicTraceSHA256, b.DeterministicTraceSHA256)
	}
}

func TestAllAlgorithmsStayBoundedUnderTimestampStrategies(t *testing.T) {
	anchor, max := testTargets()
	algorithms := []Algorithm{
		ASERT{TargetSeconds: 10, HalfLife: 3600, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}},
		LWMA{TargetSeconds: 10, Window: 30, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}},
		EthashControl{MaxTarget: max, MinDifficulty: big.NewInt(1)},
	}
	for _, algorithm := range algorithms {
		for _, mode := range []string{"honest", "future-15", "minimum", "minority-future"} {
			result, err := simulate(algorithm, Scenario{Name: "bounded-" + mode, Blocks: 2000, Kind: "stable", FactorA: 1, Timestamp: mode}, 10, anchor, max, 99)
			if err != nil {
				t.Fatalf("%s/%s: %v", algorithm.Name(), mode, err)
			}
			if result.FinalDifficultyRatio <= 0 || result.FinalDifficultyRatio > ratio(anchor, one) {
				t.Fatalf("%s/%s out of bounds: %f", algorithm.Name(), mode, result.FinalDifficultyRatio)
			}
			if result.TimestampOffsetMaximum > 15.000001 {
				t.Fatalf("%s/%s exceeded future timestamp limit: %f", algorithm.Name(), mode, result.TimestampOffsetMaximum)
			}
		}
	}
}

func TestGreaterWorkWinsPartition(t *testing.T) {
	anchor, max := testTargets()
	algorithm := ASERT{TargetSeconds: 10, HalfLife: 3600, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}}
	result, err := simulatePartition(algorithm, 10, .9, anchor, max, 123)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := new(big.Int).SetString(result.BranchAWork, 10)
	b, _ := new(big.Int).SetString(result.BranchBWork, 10)
	if a.Cmp(b) <= 0 || result.WinningBranch != "A" {
		t.Fatalf("90%% branch did not win by work: %+v", result)
	}
}

func TestShockRecoveryIsRecorded(t *testing.T) {
	anchor, max := testTargets()
	algorithm := ASERT{TargetSeconds: 10, HalfLife: 1800, AnchorTarget: anchor, Limits: Limits{MaxTarget: max}}
	result, err := simulate(algorithm, Scenario{Name: "shock", Blocks: 10000, Transition: 1000, Kind: "step", FactorA: 1, FactorB: 2, Timestamp: "honest"}, 10, anchor, max, 777)
	if err != nil {
		t.Fatal(err)
	}
	if result.RecoverySeconds <= 0 {
		t.Fatalf("recovery was not recorded: %+v", result)
	}
}
