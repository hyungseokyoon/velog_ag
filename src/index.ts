import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { VelogClient } from "./velog-client.js";
import { loadTokens, loginAndExtractTokens } from "./auth.js";

// Load tokens: env vars > saved file
function resolveTokens() {
  const envAccess = process.env.VELOG_ACCESS_TOKEN;
  const envRefresh = process.env.VELOG_REFRESH_TOKEN;
  if (envAccess) {
    return { accessToken: envAccess, refreshToken: envRefresh };
  }
  const saved = loadTokens();
  if (saved) {
    return { accessToken: saved.accessToken, refreshToken: saved.refreshToken };
  }
  return { accessToken: undefined, refreshToken: undefined };
}

let tokens = resolveTokens();
let client = new VelogClient(tokens.accessToken, tokens.refreshToken);

const server = new McpServer({
  name: "velog-mcp",
  version: "0.1.0",
});

// ── Auth tool ──

server.tool(
  "login",
  "Open a browser to log in to Velog and save authentication tokens",
  {},
  async () => {
    try {
      const result = await loginAndExtractTokens();
      tokens = { accessToken: result.accessToken, refreshToken: result.refreshToken };
      client = new VelogClient(tokens.accessToken, tokens.refreshToken);
      return {
        content: [{ type: "text", text: `Login successful! Tokens saved. (access_token expires in ~1 day, refresh_token in ~30 days)` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Login failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// ── Read tools (no auth required) ──

server.tool(
  "get_user_posts",
  "Get a list of posts by a Velog user",
  {
    username: z.string().describe("Velog username"),
    cursor: z.string().optional().describe("Cursor for pagination (post ID)"),
    limit: z.number().min(1).max(100).default(20).describe("Number of posts to fetch"),
  },
  async ({ username, cursor, limit }) => {
    const posts = await client.getUserPosts(username, cursor, limit);
    return { content: [{ type: "text", text: JSON.stringify(posts, null, 2) }] };
  },
);

server.tool(
  "read_post",
  "Read a specific Velog post with full content, comments, and metadata",
  {
    username: z.string().describe("Velog username"),
    url_slug: z.string().describe("Post URL slug"),
  },
  async ({ username, url_slug }) => {
    const post = await client.readPost(username, url_slug);
    return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
  },
);

server.tool(
  "get_trending_posts",
  "Get trending posts from Velog",
  {
    offset: z.number().min(0).default(0).describe("Offset for pagination"),
    limit: z.number().min(1).max(100).default(20).describe("Number of posts to fetch"),
    timeframe: z
      .enum(["day", "week", "month"])
      .default("week")
      .describe("Timeframe for trending"),
  },
  async ({ offset, limit, timeframe }) => {
    const posts = await client.getTrendingPosts(offset, limit, timeframe);
    return { content: [{ type: "text", text: JSON.stringify(posts, null, 2) }] };
  },
);

server.tool(
  "get_user_profile",
  "Get a Velog user's profile information",
  {
    username: z.string().describe("Velog username"),
  },
  async ({ username }) => {
    const profile = await client.getUserProfile(username);
    return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
  },
);

server.tool(
  "get_series_list",
  "Get a user's series list on Velog",
  {
    username: z.string().describe("Velog username"),
  },
  async ({ username }) => {
    const series = await client.getSeriesList(username);
    return { content: [{ type: "text", text: JSON.stringify(series, null, 2) }] };
  },
);

server.tool(
  "search_posts",
  "Search for posts on Velog by keyword",
  {
    keyword: z.string().describe("Search keyword"),
    offset: z.number().min(0).default(0).describe("Offset for pagination"),
    limit: z.number().min(1).max(100).default(20).describe("Number of results"),
    username: z.string().optional().describe("Filter by username"),
  },
  async ({ keyword, offset, limit, username }) => {
    const results = await client.searchPosts(keyword, offset, limit, username);
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  },
);

// ── Write tools (auth required) ──

function requireAuth() {
  if (!tokens.accessToken) {
    return {
      content: [{ type: "text" as const, text: "Not authenticated. Please run the 'login' tool first to open a browser and log in." }],
      isError: true as const,
    };
  }
  return null;
}

server.tool(
  "write_post",
  "Create a new post on Velog (requires authentication)",
  {
    title: z.string().describe("Post title"),
    body: z.string().describe("Post body (markdown)"),
    tags: z.array(z.string()).optional().describe("Tags for the post"),
    is_private: z.boolean().default(false).describe("Whether the post is private"),
    url_slug: z.string().optional().describe("Custom URL slug"),
    series_id: z.string().optional().describe("Series ID to add the post to"),
    thumbnail: z.string().optional().describe("Thumbnail image URL"),
  },
  async ({ title, body, tags, is_private, url_slug, series_id, thumbnail }) => {
    const authError = requireAuth();
    if (authError) return authError;
    // url_slug is required by Velog API; auto-generate from title if not provided
    const slug = url_slug ?? title.replace(/[^a-zA-Z0-9가-힣\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
    const post = await client.writePost({ title, body, tags, is_private, url_slug: slug, series_id, thumbnail });
    return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
  },
);

server.tool(
  "edit_post",
  "Edit an existing post on Velog (requires authentication)",
  {
    id: z.string().describe("Post ID to edit"),
    title: z.string().optional().describe("New title"),
    body: z.string().optional().describe("New body (markdown)"),
    tags: z.array(z.string()).optional().describe("New tags"),
    is_private: z.boolean().optional().describe("Whether the post is private"),
    url_slug: z.string().optional().describe("New URL slug"),
    series_id: z.string().optional().describe("Series ID"),
    thumbnail: z.string().optional().describe("New thumbnail image URL"),
  },
  async ({ id, title, body, tags, is_private, url_slug, series_id, thumbnail }) => {
    const authError = requireAuth();
    if (authError) return authError;
    const post = await client.editPost({ id, title, body, tags, is_private, url_slug, series_id, thumbnail });
    return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
  },
);

server.tool(
  "delete_post",
  "Delete a post on Velog (requires authentication)",
  {
    id: z.string().describe("Post ID to delete"),
  },
  async ({ id }) => {
    const authError = requireAuth();
    if (authError) return authError;
    const result = await client.deletePost(id);
    return { content: [{ type: "text", text: result ? "Post deleted successfully." : "Failed to delete post." }] };
  },
);

server.tool(
  "update_profile",
  "Update the current user's profile (requires authentication)",
  {
    display_name: z.string().optional().describe("New display name (uses current if omitted)"),
    short_bio: z.string().optional().describe("New short bio (uses current if omitted)"),
  },
  async ({ display_name, short_bio }) => {
    const authError = requireAuth();
    if (authError) return authError;

    let finalDisplayName = display_name;
    let finalShortBio = short_bio;

    if (!finalDisplayName || !finalShortBio) {
      const currentUser = await client.getCurrentUser();
      if (!currentUser || !currentUser.profile) {
        return {
          content: [{ type: "text", text: "Failed to retrieve current user profile for merge." }],
          isError: true,
        };
      }
      if (!finalDisplayName) finalDisplayName = currentUser.profile.display_name;
      if (!finalShortBio) finalShortBio = currentUser.profile.short_bio;
    }

    const profile = await client.updateProfile(finalDisplayName!, finalShortBio!);
    return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
  },
);

function parseLocalMarkdown(content: string) {
  let title = "";
  let tags: string[] = [];
  let body = content;
  let thumbnail: string | undefined = undefined;
  let is_private = false;

  const frontmatterMatch = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    body = content.slice(frontmatterMatch[0].length).trim();

    const lines = yaml.split("\n");
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, "");
        if (key === "title") {
          title = value;
        } else if (key === "tags") {
          if (value.startsWith("[") && value.endsWith("]")) {
            tags = value.slice(1, -1).split(",").map(t => t.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
          } else {
            tags = value.split(",").map(t => t.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
          }
        } else if (key === "thumbnail") {
          thumbnail = value;
        } else if (key === "is_private" || key === "private") {
          is_private = value === "true";
        }
      }
    }
  }

  if (!title) {
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      title = h1Match[1].trim();
      body = body.replace(h1Match[0], "").trim();
    }
  }

  return { title, body, tags, thumbnail, is_private };
}

server.tool(
  "publish_local_markdown",
  "Publish a local markdown file as a Velog post (requires authentication)",
  {
    filePath: z.string().describe("Absolute path to the local markdown file to publish"),
    title: z.string().optional().describe("Override title. If not provided, parsed from frontmatter or first H1 header."),
    tags: z.array(z.string()).optional().describe("Override tags. If not provided, parsed from frontmatter."),
    is_private: z.boolean().optional().describe("Override privacy setting. If not provided, parsed from frontmatter (default: false)."),
    thumbnail: z.string().optional().describe("Override thumbnail image URL. If not provided, parsed from frontmatter."),
  },
  async ({ filePath, title, tags, is_private, thumbnail }) => {
    const authError = requireAuth();
    if (authError) return authError;

    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const parsed = parseLocalMarkdown(fileContent);

      const finalTitle = title || parsed.title || path.basename(filePath, path.extname(filePath));
      const finalBody = parsed.body;
      const finalTags = tags || parsed.tags;
      const finalIsPrivate = is_private !== undefined ? is_private : parsed.is_private;
      const finalThumbnail = thumbnail || parsed.thumbnail;

      const slug = finalTitle.replace(/[^a-zA-Z0-9가-힣\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
      const post = await client.writePost({
        title: finalTitle,
        body: finalBody,
        tags: finalTags,
        is_private: finalIsPrivate,
        url_slug: slug,
        thumbnail: finalThumbnail,
      });

      return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to publish local markdown file: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);


// ── Start server ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const authStatus = tokens.accessToken ? "authenticated" : "not authenticated (use 'login' tool)";
  console.error(`Velog MCP server running on stdio (${authStatus})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
