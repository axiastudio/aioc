import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://axiastudio.github.io",
  base: "/aioc",
  integrations: [
    starlight({
      title: "AIOC Docs",
      description:
        "Governance-first SDK for LLM agents with deterministic policy gates and auditable run records.",
      components: {
        Hero: "./src/components/Hero.astro",
      },
      disable404Route: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/axiastudio/aioc",
        },
      ],
      sidebar: [
        { label: "Overview", link: "/" },
        {
          label: "Start Here",
          items: [
            "quickstart",
            "core-concepts",
            "governance-first-design",
            "approval-flows",
            "run-records",
            { label: "Examples", slug: "example-guides" },
            "reference-ui",
          ],
        },
        {
          label: "Reference",
          items: [
            "reference",
            "reference/agent",
            "reference/tools",
            "reference/run",
            "reference/logger",
            "reference/policies",
            "reference/providers",
            "reference/run-record-utils",
          ],
        },
        {
          label: "Governance",
          items: [
            "governance",
            {
              label: "Current Documents",
              autogenerate: { directory: "governance/current" },
            },
            {
              label: "Historical Snapshots",
              autogenerate: { directory: "governance/historical" },
            },
          ],
        },
      ],
    }),
  ],
});
