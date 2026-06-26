import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const googleTagId = process.env.AIOC_DOCS_GOOGLE_TAG_ID;
const analyticsConsentStorageKey = "aioc-docs-analytics-consent";
const docsBasePath = "/aioc";

const googleAnalyticsHead = googleTagId
  ? [
      {
        tag: "script",
        content: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
const aiocAnalyticsConsent = (() => {
  try {
    return localStorage.getItem("${analyticsConsentStorageKey}") === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
})();
gtag("consent", "default", {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: aiocAnalyticsConsent,
  wait_for_update: 500
});
`.trim(),
      },
      {
        tag: "script",
        attrs: {
          async: true,
          src: `https://www.googletagmanager.com/gtag/js?id=${googleTagId}`,
        },
      },
      {
        tag: "script",
        content: `
gtag("js", new Date());
gtag("config", "${googleTagId}");
`.trim(),
      },
      {
        tag: "link",
        attrs: {
          rel: "stylesheet",
          href: `${docsBasePath}/analytics-consent.css`,
        },
      },
      {
        tag: "script",
        attrs: {
          src: `${docsBasePath}/analytics-consent.js`,
          defer: true,
          "data-google-tag-id": googleTagId,
          "data-storage-key": analyticsConsentStorageKey,
        },
      },
    ]
  : [];

export default defineConfig({
  site: "https://axiastudio.github.io",
  base: "/aioc",
  integrations: [
    starlight({
      title: "AIOC Docs",
      description:
        "Governance-first SDK for LLM agents with deterministic policy gates and auditable run records.",
      head: googleAnalyticsHead,
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
          label: "Tutorials",
          items: [
            "tutorials",
            "tutorials/run-regression-suite-with-judge",
            "tutorials/build-a-self-harness-workflow",
          ],
        },
        {
          label: "Reference",
          items: [
            "reference",
            "reference/packages",
            "reference/agent",
            "reference/harness-descriptor",
            "reference/tools",
            "reference/run",
            "reference/logger",
            "reference/policies",
            "reference/approval-helpers",
            "reference/providers",
            "reference/run-output-events",
            "reference/run-record-utils",
            "reference/run-regression",
            "reference/thread-history",
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
