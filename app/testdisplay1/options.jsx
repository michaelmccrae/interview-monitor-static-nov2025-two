"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Display from './display2'

export default function SelectionPanel() {
  return (<>
    <div className="flex items-center justify-center bg-zinc-900 text-zinc-100">
      
      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-16">
        
        {/* Column 1 */}
        <div className="flex flex-col space-y-4">
          <h3 className="text-lg font-semibold text-zinc-200">
            Discussion Type
          </h3>

          <RadioGroup defaultValue="qa" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="qa" id="qa" />
              <Label htmlFor="qa" className="text-zinc-300 cursor-pointer">
                Q&amp;A
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="open-discussion"
                id="open-discussion"
              />
              <Label
                htmlFor="open-discussion"
                className="text-zinc-300 cursor-pointer"
              >
                Open Discussion
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Column 2 */}
        <div className="flex flex-col space-y-4">
          <h3 className="text-lg font-semibold text-zinc-200">
            Lookup Frequency
          </h3>

          <RadioGroup
            defaultValue="frequent"
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="frequent" id="frequent" />
              <Label
                htmlFor="frequent"
                className="text-zinc-300 cursor-pointer"
              >
                Frequent Lookup
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="infrequent"
                id="infrequent"
              />
              <Label
                htmlFor="infrequent"
                className="text-zinc-300 cursor-pointer"
              >
                Infrequent Lookup
              </Label>
            </div>
          </RadioGroup>
        </div>

      </div>
      
    </div>
    <Display  />
    </>
  );
}
