// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://mikrosuite.com",
  base: "/chat/docs",
  integrations: [
    starlight({
      title: "MikroChat Docs",
      description: "Self-hosted team chat with channels, messages, files, auth, webhooks, and admin controls.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mikaelvesavuori/mikrochat",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "What is MikroChat?", link: "/getting-started/intro" },
            { label: "Installation", link: "/getting-started/installation" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Configuration", link: "/guides/configuration" },
            { label: "Authentication", link: "/guides/authentication" },
            { label: "User Management", link: "/guides/user-management" },
            { label: "Webhooks", link: "/guides/webhooks" },
            { label: "Deployment", link: "/guides/deployment" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Comparison", link: "/reference/comparison" },
            { label: "Server Options", link: "/reference/cli" },
            { label: "API Reference", link: "/reference/api" },
          ],
        },
      ],
    }),
  ],
});
