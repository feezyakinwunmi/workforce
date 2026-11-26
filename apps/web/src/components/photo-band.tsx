import { Reveal } from "@/components/motion";
import { Photo } from "@/components/photo";
import type { Photo as PhotoData } from "@/lib/photos";

/**
 * A full-width photo section for the product landing pages (Meet, Book, Forms): the photo
 * fills the band, a dark shade keeps the words readable, and the photo zooms slowly on hover.
 * Optional `side` photo sits in a rounded frame on the right on large screens.
 */
export function PhotoBand({
  photo,
  side,
  title,
  body,
}: {
  photo: PhotoData;
  side?: PhotoData;
  title: string;
  body: string;
}) {
  return (
    <section className="group photo-zoom relative overflow-hidden text-white">
      <Photo p={photo} w={1600} h={800} className="absolute inset-0 h-full w-full object-cover" />
      <span className="absolute inset-0 bg-gradient-to-r from-[#110e2e] via-[#110e2e]/85 to-[#110e2e]/35" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:py-32">
        <div>
          <Reveal as="h2" className="max-w-xl text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-5xl">
            {title}
          </Reveal>
          <Reveal>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/75">{body}</p>
          </Reveal>
        </div>
        {side && (
          <Reveal variant="scale" className="hidden lg:block">
            <div className="float-y overflow-hidden rounded-[2rem] rounded-tr-[5rem] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
              <Photo p={side} w={520} h={420} className="aspect-[26/21] w-full object-cover" />
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
