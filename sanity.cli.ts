// Settings for the `npx sanity` command (e.g. `npx sanity cors add`, `npx sanity dataset import`).
import { defineCliConfig } from 'sanity/cli';
import { dataset, projectId } from './sanity/env';

export default defineCliConfig({ api: { projectId, dataset } });
