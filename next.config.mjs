/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pg', '@langchain/langgraph-checkpoint-sqlite'],
};

export default nextConfig;
