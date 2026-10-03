"use client";

import { Check, ChevronDown } from "lucide-react";
import { MODELS, modelById } from "@/lib/models";
import { useUiStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ModelSelector() {
  const modelId = useUiStore((s) => s.modelId);
  const setModelId = useUiStore((s) => s.setModelId);
  const active = modelById(modelId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 rounded-full px-3 font-semibold">
          {active.label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        {MODELS.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => setModelId(m.id)} className="items-start gap-3">
            <Check
              className={m.id === active.id ? "mt-0.5 h-4 w-4 text-primary" : "mt-0.5 h-4 w-4 opacity-0"}
              aria-hidden
            />
            <span className="flex flex-col">
              <span className="font-medium">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.blurb}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
