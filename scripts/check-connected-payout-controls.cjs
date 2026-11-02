const {chromium,expect}=require('@playwright/test');
(async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  try{
    await page.goto('http://127.0.0.1:5181/test/connected-payout.html',{waitUntil:'networkidle'});
    const row=()=>page.locator('[aria-labelledby="setup-title"] li').filter({has:page.getByText('Payout details',{exact:true})});
    await row().getByRole('button').click();await page.locator('#payout-method').selectOption('bank');
    await expect(page.getByLabel('Branch',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('checkbox',{name:/I confirm the business/})).toHaveCount(0);
    await expect(page.getByRole('checkbox',{name:/I accept the merchant platform/})).toHaveCount(0);
    await page.getByLabel('Account holder name',{exact:false}).fill('Acacia Kitchen');
    await page.getByLabel('Bank name',{exact:false}).fill('Example bank');
    await page.getByLabel('Account number',{exact:false}).fill('001234');
    await page.getByRole('button',{name:'Save and return Home',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Welcome, Acacia Kitchen'})).toBeVisible();
    expect(await page.evaluate(()=>window.__payoutFixture[0].bankAccount)).toBe('001234');
    expect(await page.evaluate(()=>window.__payoutFixture.length)).toBe(1);
    process.stdout.write('PASS: connected payout exposes only supported controls; mocked save retains the declared bank account.\n');
  }finally{await browser.close();}
})().catch(error=>{process.stderr.write(String(error)+'\n');process.exitCode=1;});
