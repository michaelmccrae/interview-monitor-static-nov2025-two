import registry from "@/lib/data2/index.json";
import TranscriptMerger from "./TranscriptMerger3";

export default async function Demo3DetailPage({ params }) {
  const { key } = await params;
  const item = registry[key];

  if (!item) {
    return <div className="p-10 text-white">Item not found</div>;
  }

  let beforeData = [];
  let afterData = [];

  try {
    // START PARALLEL LOADING
    // We kick off both import requests at the exact same time
    const [beforeModule, afterModule] = await Promise.all([
      import(`@/lib/${item.before}`),
      import(`@/lib/${item.after}`)
    ]);

    beforeData = beforeModule.default;
    afterData = afterModule.default;

  } catch (error) {
    console.error("Import failed:", error);
    return <div className="p-10 text-red-400">Error loading data files.</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-8 font-sans">
      <div className="mb-8 pb-6">
        <h1 className="text-3xl font-bold text-white mb-2">{item.label}</h1>
        <p className="text-zinc-400">{item.moreinfo}</p>
      </div>

      <TranscriptMerger beforellm={beforeData} afterllm={afterData} />
    </div>
  );
}