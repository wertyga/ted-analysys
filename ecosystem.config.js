module.exports = {
  apps: [
    {
      name: 'ted-analysys-BE',
      script: 'dist/main.js',
      cwd: __dirname,
      exec_mode: 'cluster',
      // Server has 2 vCPUs; 2 workers keeps both cores busy without
      // doubling into 'max' on a RAM-constrained shared box.
      instances: 2,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
