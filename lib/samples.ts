import cuadManifest from '@/samples/cuad-manifest.json';
import demoManifest from '@/samples/demo-manifest.json';

export type Sample = {
  id: string;
  file: string;
  name: string;
  group: 'Demo contracts' | 'CUAD public contracts';
  description: string;
};

export const samples: Sample[] = [
  ...demoManifest.map((s) => ({
    id: s.id,
    file: s.file,
    name: s.name,
    group: 'Demo contracts' as const,
    description: s.summary,
  })),
  ...cuadManifest.map((s) => ({
    id: s.id,
    file: s.file,
    name: s.name.replace(' · ', ', '),
    group: 'CUAD public contracts' as const,
    description: `${s.category} agreement from the CUAD dataset`,
  })),
];

export const sampleIds = samples.map((s) => s.id) as [string, ...string[]];
