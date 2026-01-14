'use client';

import Link from "next/link";
import registry from "@/lib/data5/index.json";

export default function Demo3Page() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8 bg-zinc-900 text-zinc-200">
      <h1 className="text-2xl font-bold text-white">
        Available Transcripts
      </h1>

      <ul className="space-y-3">
        {Object.entries(registry).map(([key, item]) => (
          <li key={key} className="text-left">
            <Link
              href={`/demo5/${key}`}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {item.label || key}
            </Link>

            <span className="text-zinc-400">
              {" — "}
              {item.moreinfo}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
