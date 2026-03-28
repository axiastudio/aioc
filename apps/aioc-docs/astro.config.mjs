import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "AIOC",
      description:
        "Governance-first SDK for LLM agents with deterministic policy gates and auditable run records.",
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
            "run-records",
            { label: "Examples", slug: "example-guides" },
            "reference-ui",
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
