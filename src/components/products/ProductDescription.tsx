import { sanitizeProductDescription } from '@/lib/productDescription'

export default function ProductDescription({ text, html }: { text: string; html?: string }) {
  const safeHtml = html ? sanitizeProductDescription(html) : ''
  const className = "mt-3 text-sm leading-7 text-gray-600 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_blockquote]:border-l-2 [&_blockquote]:pl-4"
  return safeHtml ? <div className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} /> : <p className={`${className} whitespace-pre-line`}>{text}</p>
}
