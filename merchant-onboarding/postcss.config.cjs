const path = require('node:path');
const { createRequire } = require('node:module');

// Reuse the workspace's installed design tooling and token preset.
const fromWeb = createRequire(path.resolve(__dirname, '../apps/web/package.json'));
module.exports = {
  plugins: [
    fromWeb('tailwindcss')({
      presets: [fromWeb('@nexg/config/tailwind/preset')],
      content: [
        path.resolve(__dirname, 'src/**/*.{js,jsx,ts,tsx}'),
        path.resolve(__dirname, '../apps/web/components/merchant/home-setup-view.tsx'),
        path.resolve(__dirname, '../apps/web/components/merchant/home-panel.tsx'),
        path.resolve(__dirname, '../apps/web/components/merchant/workspace/workspace-frame.tsx'),
      ],
    }),
    fromWeb('autoprefixer')(),
  ],
};
