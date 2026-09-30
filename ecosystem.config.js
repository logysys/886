export default {
  apps: [
    {
      name: '886.wiki',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'server.ts',
      cwd: '/var/www/886.wiki',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3009,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3009,
      },
    },
  ],
};
