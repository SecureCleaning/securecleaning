import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as ts from 'typescript'

const testsDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolvePath(testsDirectory, '..')

// The pricing module imports the Supabase client at module load time. These
// harmless placeholders keep pure unit tests independent from local secrets.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const TypeScriptExtensions = new Set(['.ts', '.tsx'])

function hasFileExtension(specifier) {
  return Boolean(extname(specifier))
}

async function resolveWithExtension(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (hasFileExtension(specifier)) throw error

    for (const extension of ['.ts', '.tsx', '.mjs', '.js']) {
      try {
        return await nextResolve(`${specifier}${extension}`, context)
      } catch {
        // Try the next source extension.
      }
    }

    throw error
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const sourcePath = join(repositoryRoot, 'src', specifier.slice(2))
    return resolveWithExtension(pathToFileURL(sourcePath).href, context, nextResolve)
  }

  return resolveWithExtension(specifier, context, nextResolve)
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:')) {
    return nextLoad(url, context)
  }

  const extension = extname(fileURLToPath(url))
  if (!TypeScriptExtensions.has(extension)) {
    return nextLoad(url, context)
  }

  const source = await readFile(fileURLToPath(url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: fileURLToPath(url),
  })

  return {
    format: 'module',
    source: transpiled.outputText,
    shortCircuit: true,
  }
}
