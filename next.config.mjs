/** @type {import('next').NextConfig} */

function getNormalizedBackendUrl() {
  let raw = (process.env.BACKEND_API_URL || "").trim();

  if (!raw) {
    return "http://localhost:5000";
  }

  // Remove any trailing slashes
  raw = raw.replace(/\/+$/, "");

  // If already starts with http:// or https://
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  // If it's a localhost or IP address without protocol
  if (raw.startsWith("localhost") || raw.startsWith("127.0.0.1")) {
    return `http://${raw}`;
  }

  // If it doesn't contain a dot (e.g. Render service slug 'prepkit-backend-kt9o'),
  // append .onrender.com to form the full public HTTPS domain
  if (!raw.includes(".")) {
    return `https://${raw}.onrender.com`;
  }

  // Otherwise, prepend https://
  return `https://${raw}`;
}

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendUrl = getNormalizedBackendUrl();
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
