import { CopyButton } from "@/components/form";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { formsLinkFor, myForm } from "@/lib/forms/server";

export const metadata = { title: "Share" };

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { form } = await myForm(id);
  const link = await formsLinkFor(`/f/${form.slug}`);
  const origin = new URL(link).origin;
  const script = `<div data-workbase-form="${link}"></div>\n<script src="${origin}/forms-embed.js" async></script>`;
  const iframe = `<iframe src="${link}?embed=1" title="${form.title.replace(/"/g, "&quot;")}" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${form.title}\n${link}`)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      {!form.published && <Notice tone="warning">This form is a draft. Publish it (top right) so people can open the link.</Notice>}

      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-900">Link</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">{link}</code>
          <CopyButton text={link} />
          <a href={wa} target="_blank" rel="noopener" className="btn-secondary btn-sm"><Icon name="whatsapp" className="h-4 w-4" /> WhatsApp</a>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-900">Put it on your website</h2>
        <p className="mt-1 text-sm text-slate-600">Paste this where the form should appear. It fits the page width and grows with the form.</p>
        <Code text={script} />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Site doesn&apos;t allow scripts? Use a plain frame</summary>
          <Code text={iframe} />
        </details>
        <p className="mt-4 text-xs text-slate-500">For a dark website, add <code className="rounded bg-slate-100 px-1">data-theme=&quot;dark&quot;</code> to the first line.</p>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-900">WordPress</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Open the page or post in the WordPress editor.</li>
          <li>Click <b>+</b>, search for <b>Custom HTML</b> and add that block.</li>
          <li>Paste the website code from above into the block.</li>
          <li>Click <b>Preview</b>, then <b>Update</b> or <b>Publish</b>.</li>
        </ol>
        <p className="mt-3 text-sm text-slate-600">
          <b>Elementor:</b> drag in the <b>HTML</b> widget and paste the code. <b>Classic editor:</b> switch to the <b>Text</b> tab and paste it.
        </p>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-900">Wix, Squarespace, Webflow, Shopify</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li><b>Wix:</b> Add → Embed code → Embed HTML, then paste the code.</li>
          <li><b>Squarespace:</b> add a <b>Code</b> block and paste the code.</li>
          <li><b>Webflow:</b> drag in an <b>Embed</b> element and paste the code.</li>
          <li><b>Shopify:</b> in a page, click <b>Show HTML</b> (&lt;&gt;) and paste the code.</li>
        </ul>
      </section>
    </div>
  );
}

function Code({ text }: { text: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <pre className="overflow-x-auto bg-[#15123a] p-4 text-xs leading-relaxed text-white"><code>{text}</code></pre>
      <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-3 py-2">
        <CopyButton text={text} label="Copy code" />
      </div>
    </div>
  );
}
