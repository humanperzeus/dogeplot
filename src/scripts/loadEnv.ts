import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

interface EnvConfig {
  mode: string;
  envFile: string;
  variables: Record<string, string>;
}

class EnvLoader {
  private static instance: EnvLoader;
  private currentConfig: EnvConfig | null = null;
  private isLoading: boolean = false;

  private constructor() {}

  static getInstance(): EnvLoader {
    if (!this.instance) {
      this.instance = new EnvLoader();
    }
    return this.instance;
  }

  private getEnvFile(mode: string): string {
    switch (mode) {
      case 'production':
      case 'production.proxy':
        return '.env.production';
      case 'staging':
      case 'staging.proxy':
      default:
        return '.env.staging';
    }
  }

  private validateRequiredVars(variables: Record<string, string>): void {
    const required = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missing = required.filter(key => !variables[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  async load(mode?: string): Promise<EnvConfig> {
    // If already loaded with same mode, return cached config
    if (this.currentConfig && this.currentConfig.mode === mode) {
      return this.currentConfig;
    }

    // Prevent concurrent loads
    if (this.isLoading) {
      throw new Error('Environment loading already in progress');
    }

    this.isLoading = true;

    try {
      // Get mode from environment or parameter, default to staging
      const targetMode = mode || process.env.VITE_MODE || 'staging';
      const envFile = this.getEnvFile(targetMode);

      console.log('\n=== Environment Loading ===');
      console.log('📂 Mode:', targetMode);
      console.log('📂 Loading from:', envFile);
      
      // Check if env file exists
      if (!fs.existsSync(envFile)) {
        throw new Error(`Environment file not found: ${envFile}`);
      }

      // Clear existing environment variables
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('VITE_')) {
          delete process.env[key];
        }
      });

      // Load environment variables
      config({ path: envFile, override: true });

      // Force set VITE_MODE
      process.env.VITE_MODE = targetMode;

      // Collect all environment variables
      const variables = Object.entries(process.env)
        .filter(([key]) => key.startsWith('VITE_') || key === 'SUPABASE_SERVICE_ROLE_KEY')
        .reduce((acc, [key, value]) => {
          acc[key] = value || '';
          return acc;
        }, {} as Record<string, string>);

      // Validate required variables
      this.validateRequiredVars(variables);

      // Create and cache config
      this.currentConfig = {
        mode: targetMode,
        envFile,
        variables
      };

      console.log('✅ Environment loaded successfully');
      console.log('🔑 Loaded variables:', Object.keys(variables).length);
      console.log('🔌 Supabase URL:', variables.VITE_SUPABASE_URL);
      console.log('═══════════════════════════════\n');

      return this.currentConfig;
    } finally {
      this.isLoading = false;
    }
  }

  getCurrentConfig(): EnvConfig | null {
    return this.currentConfig;
  }

  getVariable(key: string): string | undefined {
    return this.currentConfig?.variables[key];
  }

  clearConfig(): void {
    this.currentConfig = null;
  }
}

// Export singleton instance
export const envLoader = EnvLoader.getInstance();

// No automatic loading on import anymore 