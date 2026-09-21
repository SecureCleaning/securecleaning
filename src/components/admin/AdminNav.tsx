'use client'

import ConfigurableNavigation from '@/components/navigation/ConfigurableNavigation'
import { useNavigationMenu } from '@/lib/useNavigationMenu'

export default function AdminNav({ currentPath }: { currentPath: string }) {
  const menu = useNavigationMenu('admin')
  return <ConfigurableNavigation {...menu} currentPath={currentPath} label="Admin navigation" />
}
