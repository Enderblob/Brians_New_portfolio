import "./globals.css";

export const metadata = {
  title: "Skadis LiDAR Aligner",
  description: "Smooth, align, and export LiDAR STL scans for Skadis pegboard mounts."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
