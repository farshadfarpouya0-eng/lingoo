import "dotenv/config";
import assert from "node:assert/strict";
import { statSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { lessons, transactions, users } from "../src/db/schema";
import { dashboardSummary } from "../src/lib/dashboard-summary";
import { settleLessons } from "../src/lib/money";
import { roomPollDelay } from "../src/lib/room-polling";

async function main() {
  const ids:number[]=[];
  try {
    let originals=0,optimised=0;
    for(const name of ["birdie","teddy","lulu","nini","momo","piki"]){
      originals+=statSync(`public/images/kids-${name}.jpg`).size;
      const path=`public/images/kids-${name}.webp`;
      const buffer=readFileSync(path);optimised+=buffer.length;
      assert.equal(buffer.toString("ascii",8,12),"WEBP");
      assert.ok(buffer.length<60000,`${name} should be a compact card image`);
    }
    assert.ok(optimised<originals*0.10);
    assert.ok(statSync("public/images/hero-online-640.webp").size<50000);
    assert.ok(statSync("public/images/hero-online.webp").size<120000);
    console.log(`PASS kids assets: ${(originals/1048576).toFixed(2)} MiB → ${(optimised/1048576).toFixed(2)} MiB (${(100*(1-optimised/originals)).toFixed(1)}% fewer bytes)`);
    assert.equal(roomPollDelay("open"),4000);
    assert.equal(roomPollDelay("early"),10000);
    assert.equal(roomPollDelay("pending"),10000);
    assert.equal(roomPollDelay("closed"),0);
    assert.equal(roomPollDelay("open",20),30000);
    console.log("PASS active-class switching stays fast; waiting/closed polling is reduced");
    const create=async(role:string)=>{const[u]=await db.insert(users).values({name:"Performance test",email:`${randomUUID()}@test.invalid`,passwordHash:"not-a-login-account",role,balance:0}).returning();ids.push(u.id);return u;};
    const student=await create("student"),teacher=await create("teacher"),otherStudent=await create("student"),otherTeacher=await create("teacher");
    const time=Date.now();
    const insert=async(studentId:number,teacherId:number,startAt:Date,status:string,duration:number,price:number)=>{const[l]=await db.insert(lessons).values({studentId,teacherId,startAt,status,duration,price,platform:"undecided"}).returning();return l;};
    await insert(student.id,teacher.id,new Date(time-10*86400000),"completed",25,1500);
    await insert(student.id,teacher.id,new Date(time-9*86400000),"completed",50,3000);
    await insert(student.id,teacher.id,new Date(time+2*86400000),"pending",50,2400);
    const stale=await insert(student.id,teacher.id,new Date(time-3*3600000),"pending",25,100);
    const unrelated=await insert(otherStudent.id,otherTeacher.id,new Date(time-3*3600000),"pending",25,100);
    const summary=await dashboardSummary(student.id,false);
    assert.equal(summary.completedLessons,2);assert.equal(summary.completedMinutes,75);assert.equal(summary.escrow,2125);
    console.log("PASS database-side dashboard totals match complete lesson history");
    await settleLessons(student.id);
    assert.equal((await db.select().from(lessons).where(eq(lessons.id,stale.id)))[0].status,"cancelled");
    assert.equal((await db.select().from(lessons).where(eq(lessons.id,unrelated.id)))[0].status,"pending");
    assert.equal((await db.select().from(users).where(eq(users.id,student.id)))[0].balance,100);
    await settleLessons(student.id);
    assert.equal((await db.select().from(users).where(eq(users.id,student.id)))[0].balance,100);
    assert.equal((await dashboardSummary(student.id,false)).escrow,2040);
    console.log("PASS scoped settlement ignores other users and refunds exactly once");
    console.log("All performance regression checks passed. No real-world network speed guarantee is implied.");
  } finally {
    if(ids.length){await db.delete(lessons).where(inArray(lessons.studentId,ids));await db.delete(transactions).where(inArray(transactions.userId,ids));await db.delete(users).where(inArray(users.id,ids));}
    await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
