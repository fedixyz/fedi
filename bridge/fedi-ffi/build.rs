fn main() {
    fedimint_build::set_code_version();
    uniffi::generate_scaffolding("./src/fedi.udl").unwrap();
}
