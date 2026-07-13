import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredJson = [
  '.actor/actor.json',
  '.actor/input_schema.json',
  '.actor/dataset_schema.json',
  '.actor/output_schema.json',
  'package.json',
];

let failed = false;
for (const rel of requiredJson) {
  const full = path.join(root, rel);
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!data || typeof data !== 'object') throw new Error('must be a JSON object');
    console.log(`ok ${rel}`);
  } catch (error) {
    failed = true;
    console.error(`invalid ${rel}: ${error.message}`);
  }
}

const actor = JSON.parse(fs.readFileSync(path.join(root, '.actor/actor.json'), 'utf8'));
for (const key of ['actorSpecification', 'name', 'version', 'input', 'storages']) {
  if (!(key in actor)) {
    failed = true;
    console.error(`actor.json missing ${key}`);
  }
}

const input = JSON.parse(fs.readFileSync(path.join(root, '.actor/input_schema.json'), 'utf8'));
if (input.schemaVersion !== 1 || input.type !== 'object' || !input.properties) {
  failed = true;
  console.error('input_schema.json must be schemaVersion 1, object, with properties');
}

const output = JSON.parse(fs.readFileSync(path.join(root, '.actor/output_schema.json'), 'utf8'));
if (output.actorOutputSchemaVersion !== 1 || !output.title || !output.properties) {
  failed = true;
  console.error('output_schema.json must define actorOutputSchemaVersion 1, title, and properties');
}

const dataset = JSON.parse(fs.readFileSync(path.join(root, '.actor/dataset_schema.json'), 'utf8'));
if (dataset.actorSpecification !== 1 || !dataset.fields || !dataset.views) {
  failed = true;
  console.error('dataset_schema.json must define actorSpecification, fields, and views');
}

if (failed) process.exit(1);
console.log('configuration validation passed');
