/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  images: {
    unoptimized: true
  },
  trailingSlash: true,
  basePath: isGithubPages ? "/Brians_New_portfolio" : "",
  assetPrefix: isGithubPages ? "/Brians_New_portfolio/" : ""
};

export default nextConfig;
