describe('Login mobile smoke', () => {
  beforeAll(async () => {
    await device.launchApp({
      delete: true,
      newInstance: true,
    });
  });

  it('muestra el acceso principal', async () => {
    await waitFor(element(by.text('ManeComb'))).toBeVisible().withTimeout(60000);
    await waitFor(element(by.text('Ya tengo cuenta'))).toBeVisible().withTimeout(10000);
  });
});
