/**
 * Format a number with proper thousands separators and decimal places
 * @param value The number or string to format
 * @param decimals Number of decimal places (default: 4)
 * @returns Formatted string with thousands separators and specified decimal places
 */
export const formatNumber = (value: string | number, decimals: number = 4): string => {
  // Convert string to number if needed
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  // Handle invalid numbers
  if (isNaN(num)) return '0' + (decimals > 0 ? ',' + '0'.repeat(decimals) : '');
  
  // Format the number with specified decimal places
  const parts = num.toFixed(decimals).split('.');
  
  // Add thousands separators to the integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Combine with decimal part if needed
  return parts.join(',');
};
