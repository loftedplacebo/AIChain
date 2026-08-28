fn main() {
    sp1_build::build_program_with_args("../program", Default::default());
    sp1_build::build_program_with_args("../program-wrong-key", Default::default());
}
