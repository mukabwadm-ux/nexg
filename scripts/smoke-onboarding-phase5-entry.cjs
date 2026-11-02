const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const writes=[],errors=[],checks=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());});
  try{
    await page.goto('http://127.0.0.1:5181/',{waitUntil:'networkidle'});
    await expect(page.getByRole('heading',{name:'Set up your business',exact:true})).toBeVisible();
    const entry=page.getByRole('link',{name:'Start real registration',exact:true});
    await expect(entry).toHaveAttribute('href','http://127.0.0.1:3000/merchants/register');
    await expect(page.locator('[data-merchant-workspace]')).toHaveCount(0);
    checks.push('Default entry links to the existing real registration route and does not pretend to submit locally.');
    await page.getByRole('button',{name:'Try demo · sample data',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Welcome, Demo business'})).toBeVisible();
    await expect(page.getByText('Demo · sample data',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Try demo · sample data',exact:true})).toHaveCount(0);
    checks.push('Demo activates from onboarding; its portal is labelled and has no activation toggle.');
    await page.getByRole('button',{name:'Review registration',exact:false}).click();
    await page.getByLabel('Business name',{exact:false}).fill('Do not transfer this draft');
    await page.getByRole('button',{name:'Exit demo',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Set up your business',exact:true})).toBeVisible();
    await expect(page.getByText('Do not transfer this draft',{exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Try demo · sample data',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Welcome, Demo business'})).toBeVisible();
    checks.push('Exit discards the demo draft; a new demo starts from synthetic data and never transfers it to real entry.');
    await page.getByRole('button',{name:'Exit demo',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
    expect(writes).toEqual([]);expect(errors).toEqual([]);
    const output=path.join(__dirname,'../docs/merchant-portal-plan/onboarding-integration/implementation');fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,'phase-5-onboarding-entry-phone.png'),fullPage:true});
    fs.writeFileSync(path.join(output,'phase-5-entry-browser-verification.json'),JSON.stringify({clientDate:'2026-11-02',status:'PASS',scope:'Actual standalone entry/demo UI; real platform link inspected, not a remote Auth acceptance.',checks,serverWrites:writes,pageErrors:errors},null,2)+'\n');
    process.stdout.write(JSON.stringify({status:'PASS',checks:checks.length,serverWrites:writes.length,pageErrors:errors.length})+'\n');
  }finally{await browser.close();}
})().catch(error=>{process.stderr.write(String(error)+'\n');process.exitCode=1;});
