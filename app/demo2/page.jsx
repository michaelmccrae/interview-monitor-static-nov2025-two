// app/transcript/[key]/page.jsx
import Display from "./display1.jsx";
import registry from "@/lib/data2/index.json";

export default async function Page({ params }) {
  const key = params.key;
  const def = registry[key];

  if (!def) {
    return <div className="p-6 text-red-600">Invalid transcript key.</div>;
  }

  // Server-side load of JSON files
const beforeModule = await import(`@/lib/${def.before}`);
const afterModule  = await import(`@/lib/${def.after}`);


  const beforeLLM = beforeModule.default;
  const afterLLM  = afterModule.default;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4">
        Transcript: {def.label || key}
      </h1>

      <Display beforeLLM={beforeLLM} afterLLM={afterLLM} />
    </div>
  );
}
