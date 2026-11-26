import type { Metadata } from "next";
import { myBrand, requirePadiUser } from "@/lib/padi/server";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { title: "My brand" };

/** Brand profile: everything Padi needs to sound like this business. First visit = setup. */
export default async function PadiSetup() {
  const { supabase } = await requirePadiUser();
  const brand = await myBrand(supabase);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{brand ? "My brand" : "Tell Padi about your business"}</h1>
      <p className="mt-1 text-slate-600">{brand ? "Padi uses this for every post it writes." : "Two minutes now, and every post sounds like you."}</p>
      <BrandForm brand={brand} />
    </div>
  );
}
