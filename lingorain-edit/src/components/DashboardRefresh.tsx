"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function DashboardRefresh() {
  const router=useRouter();
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==="visible"&&!document.querySelector("dialog[open]"))router.refresh();},20000);return()=>clearInterval(timer);},[router]);
  return null;
}
