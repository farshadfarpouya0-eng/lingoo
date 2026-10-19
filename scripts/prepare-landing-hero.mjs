import sharp from "sharp";

// Derive compact hero art from existing, approved site images only.
// No remote fetches, generated characters or emoji assets are added.
await sharp("public/images/feature-study.webp").resize(800,1000,{fit:"cover",position:sharp.strategy.attention}).webp({quality:81,effort:5}).toFile("public/images/hero-adults.webp");
await sharp("public/images/hero-adults.webp").resize(400,500).webp({quality:80,effort:5}).toFile("public/images/hero-adults-400.webp");
async function cutout(file,width,height) {
  const {data,info}=await sharp(file).resize({width,height,fit:"inside"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info;
  const visited=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let head=0,tail=0;
  const isBackground=i=>{const p=i*4;const max=Math.max(data[p],data[p+1],data[p+2]),min=Math.min(data[p],data[p+1],data[p+2]);return min>204&&max-min<42;};
  const enqueue=i=>{if(i<0||i>=w*h||visited[i]||!isBackground(i))return;visited[i]=1;queue[tail++]=i;};
  for(let x=0;x<w;x++){enqueue(x);enqueue((h-1)*w+x);}
  for(let y=0;y<h;y++){enqueue(y*w);enqueue(y*w+w-1);}
  while(head<tail){const i=queue[head++],x=i%w;data[i*4+3]=0;if(x>0)enqueue(i-1);if(x<w-1)enqueue(i+1);if(i>=w)enqueue(i-w);if(i<(h-1)*w)enqueue(i+w);}
  return sharp(data,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
}
const [teddy,lulu,birdie]=await Promise.all([
  cutout("public/images/kids-teddy.webp",320,470),
  cutout("public/images/kids-lulu.webp",300,440),
  cutout("public/images/kids-birdie.webp",370,510),
]);
await sharp({create:{width:700,height:780,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
  {input:teddy,left:8,top:72},{input:lulu,left:394,top:97},{input:birdie,left:179,top:262},
]).webp({quality:84,effort:5}).toFile("public/images/hero-kids.webp");
console.log("Prepared responsive adult photography and the existing children's learning crew for the split hero.");
