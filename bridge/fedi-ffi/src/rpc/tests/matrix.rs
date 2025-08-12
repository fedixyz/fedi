use super::*;

pub async fn test_matrix_login(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;

    // Wait for matrix to initialize
    let _matrix = bridge.matrix.wait().await;

    // If we get here, matrix login was successful
    Ok(())
}
