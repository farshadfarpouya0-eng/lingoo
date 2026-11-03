import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const origin=new URL(process.argv[2]||"http://localhost:3000").origin;
mkdirSync("artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try {
  for(const lang of ["en","zh","ja"]){
    const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:"en-US"});
    await ctx.addCookies([{name:"lang",value:lang,url:origin}]);
    const page=await ctx.newPage(),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    for(const width of [320,360,390,430,768,1024,1440]){
      await page.setViewportSize({width,height:844});
      await page.goto(`${origin}/`,{waitUntil:"domcontentloaded"});
      await expect(page.locator("#hero-title")).toBeVisible({timeout:20000});
      await expect(page.getByTestId("adult-hero")).toBeVisible();
      await expect(page.getByTestId("kids-hero")).toBeVisible();
      await expect(page.getByTestId("adult-hero-cta")).toHaveAttribute("href","/teachers?audience=adults");
      await expect(page.getByTestId("kids-hero-cta")).toHaveAttribute("href","/teachers?audience=kids&tag=Kids");
      const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,kidsTop:document.querySelector('[data-testid="kids-hero"]').getBoundingClientRect().top,kidsCtaBottom:document.querySelector('[data-testid="kids-hero-cta"]').getBoundingClientRect().bottom,adultTop:document.querySelector('[data-testid="adult-hero"]').getBoundingClientRect().top,kidsGalleryTop:document.querySelector("#kids-learning").getBoundingClientRect().top}));
      assert.ok(metrics.scroll<=width+1,`${lang} ${width}px: horizontal overflow ${JSON.stringify(metrics)}`);
      if(width<=430){assert.ok(metrics.kidsTop<750,`${lang} ${width}px: kids path buried ${JSON.stringify(metrics)}`);if(width>=390)assert.ok(metrics.kidsCtaBottom<=844,`${lang} ${width}px: both paths should fit the first mobile screen ${JSON.stringify(metrics)}`);assert.ok(metrics.kidsGalleryTop<1350,`${lang} ${width}px: kids section should be near the start`);}
      else if(width>=768){const boxes=await page.evaluate(()=>({a:document.querySelector('[data-testid="adult-hero"]').getBoundingClientRect().top,k:document.querySelector('[data-testid="kids-hero"]').getBoundingClientRect().top}));assert.ok(Math.abs(boxes.a-boxes.k)<2,`${lang} ${width}px: desktop paths not side by side`);}
      if(lang==="en"&&[390,768,1440].includes(width)){await page.screenshot({path:`artifacts/split-hero-${width}.png`});if(width===390)await page.screenshot({path:"artifacts/responsive-home-mobile.png",fullPage:true});}
      console.log(`PASS ${lang} ${width}px: split paths visible and no horizontal overflow`);
    }
    assert.deepEqual(errors,[],`${lang}: browser errors`);
    await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();
  await page.goto(`${origin}/`,{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Open menu",exact:true}).click();
  const menu=page.getByRole("dialog",{name:"Explore Lingorain",exact:true});
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link",{name:"Adult English",exact:true})).toBeVisible();
  await expect(menu.getByRole("link",{name:"Kids English",exact:true})).toBeVisible();
  await expect(menu.getByRole("button",{name:"English",exact:true})).toBeVisible();
  await page.screenshot({path:"artifacts/mobile-navigation.png"});
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),"");
  console.log("PASS mobile menu: navigation, language options, Escape and scroll restoration");
  const rail=page.locator(".snap-rail-kids .home-snap-rail");
  await page.locator(".snap-rail-kids").getByRole("button",{name:"Next cards",exact:true}).click();
  await expect.poll(async()=>rail.evaluate(el=>el.scrollLeft)).toBeGreaterThan(100);
  console.log("PASS children's card carousel buttons work on mobile");
  await page.goto(`${origin}/`,{waitUntil:"domcontentloaded"});
  await page.getByTestId("kids-hero-cta").click();
  await page.waitForURL(/audience=kids/);
  await expect(page.locator(".tutor-profile-card").filter({hasText:"Sophie Martin"})).toBeVisible();
  await expect(page.locator(".tutor-profile-card").filter({hasText:"James Wilson"})).toHaveCount(0);
  await page.goto(`${origin}/`,{waitUntil:"domcontentloaded"});
  await page.getByTestId("adult-hero-cta").click();
  await page.waitForURL(/audience=adults/);
  await expect(page.locator(".tutor-profile-card").filter({hasText:"James Wilson"})).toBeVisible();
  await expect(page.locator(".tutor-profile-card").filter({hasText:"Sophie Martin"})).toHaveCount(0);
  console.log("PASS both hero CTAs lead to the correct database-backed tutor audience");
  await page.goto(`${origin}/`,{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Open menu",exact:true}).click();
  await menu.getByRole("button",{name:"日本語",exact:true}).click();
  await expect(page.locator("html")).toHaveAttribute("lang","ja",{timeout:15000});
  await expect(page.getByTestId("kids-hero-cta")).toContainText("キッズ講師を探す");
  console.log("PASS mobile language switching renders the translated adult and kids hero");
  await ctx.close();
  console.log("All split-hero/mobile-layout browser tests passed.");
}finally{await browser.close();}
