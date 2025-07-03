"use client"

import React, { useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface VariableTextareaProps {
  value: string
  onChange: (value: string) => void
  availableVariables?: string[]
  className?: string
  disabled?: boolean
  placeholder?: string
}

export function VariableTextarea({
  value,
  onChange,
  availableVariables = [],
  className,
  disabled = false,
  placeholder = "",
  ...props
}: VariableTextareaProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)



  // Function to highlight variables in the text
  const highlightVariables = (text: string) => {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const isValidVariable = availableVariables.includes(variable.trim())
      const colorClass = isValidVariable 
        ? 'bg-blue-500/20 text-blue-300 px-1 rounded' 
        : 'bg-red-500/20 text-red-300 px-1 rounded'
      return `<span class="${colorClass}">${match}</span>`
    })
  }

  // Update the content when value changes externally
  useEffect(() => {
    if (contentRef.current && !isFocused) {
      const highlightedHTML = highlightVariables(value)
      contentRef.current.innerHTML = highlightedHTML
    }
  }, [value, availableVariables, isFocused])

  // Set initial content on mount
  useEffect(() => {
    if (contentRef.current && value && !isFocused) {
      const highlightedHTML = highlightVariables(value)
      contentRef.current.innerHTML = highlightedHTML
    }
  }, []) // Only run on mount

  // Handle input changes
  const handleInput = () => {
    if (contentRef.current) {
      const plainText = contentRef.current.innerText || ''
      onChange(plainText)
    }
  }

  // Handle focus
  const handleFocus = () => {
    if (disabled) return
    setIsFocused(true)
    if (contentRef.current) {
      // Switch to plain text for editing
      contentRef.current.innerText = value
    }
  }

  // Handle blur
  const handleBlur = () => {
    setIsFocused(false)
    if (contentRef.current) {
      const plainText = contentRef.current.innerText || ''
      onChange(plainText)
      // Switch back to highlighted HTML
      const highlightedHTML = highlightVariables(plainText)
      contentRef.current.innerHTML = highlightedHTML
    }
  }

  // Handle paste to ensure plain text only
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  // Handle click to focus when not disabled
  const handleClick = () => {
    if (!disabled && contentRef.current) {
      contentRef.current.focus()
    }
  }

  return (
    <div className="relative">
      <div
        ref={contentRef}
        contentEditable={disabled ? false : true}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onClick={handleClick}
        className={cn(
          "min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "whitespace-pre-wrap break-words overflow-auto",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text",
          className
        )}
        style={{
          minHeight: '200px',
          maxHeight: '400px',
          overflowY: 'auto',
          color: 'white',
        }}
        suppressContentEditableWarning={true}
        role="textbox"
        aria-multiline="true"
        {...props}
      />
      {/* Placeholder */}
      {!value && placeholder && (
        <div className="absolute top-2 left-3 text-sm text-muted-foreground pointer-events-none">
          {placeholder}
        </div>
      )}
    </div>
  )
} 