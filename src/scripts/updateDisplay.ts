// Function to update the display with progress information
export function updateDisplay(
  workerStats: Map<number, any>,
  options: { limit: number; threads: number }
) {
  // Clear the entire screen and move cursor to top-left
  process.stdout.write('\x1B[2J\x1B[H');
  
  // Print header
  console.log('\n\x1b[1m\x1b[36m=== 🔄 Bill Synchronization Status 🔄 ===\x1b[0m\n');
  
  // Calculate total progress
  let totalProcessed = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalWithText = 0;
  let totalApiText = 0;
  let totalPdfText = 0;
  
  // Gather stats from all workers
  Array.from(workerStats.entries()).forEach(([idx, stat]) => {
    totalProcessed += stat.processed;
    totalSuccessful += stat.successful;
    totalFailed += stat.failed;
    totalWithText += stat.withText;
    totalApiText += stat.apiText;
    totalPdfText += stat.pdfText;
  });
  
  const progressPercent = Math.round((totalProcessed / options.limit) * 100);
  
  // Create progress bar
  const barWidth = 40;
  const completedWidth = Math.round((progressPercent / 100) * barWidth);
  let progressBar = '';
  
  // Create gradient colors for the progress bar
  for (let i = 0; i < barWidth; i++) {
    if (i < completedWidth) {
      // Gradient from red to yellow to green
      let r = 0, g = 0, b = 0;
      const percent = (i / barWidth) * 100;
      
      if (percent < 50) {
        // Red to Yellow
        r = 255;
        g = Math.round((percent / 50) * 255);
        b = 0;
      } else {
        // Yellow to Green
        r = Math.round(255 - ((percent - 50) / 50) * 255);
        g = 255;
        b = 0;
      }
      
      progressBar += '\x1b[38;2;' + r + ';' + g + ';' + b + 'm█\x1b[0m';
    } else {
      progressBar += '░';
    }
  }
  
  // Display global progress
  console.log('\x1b[1mProgress: [' + progressBar + '] ' + progressPercent + '% (' + totalProcessed + '/' + options.limit + ')\x1b[0m\n');
  
  // Display worker status
  Array.from(workerStats.entries()).forEach(([idx, stat]) => {
    const workerProgress = Math.round((stat.processed / (options.limit / options.threads)) * 100);
    const currentBill = stat.currentBill || 'N/A';
    
    console.log(
      '\x1b[36mWorker ' + idx + ':\x1b[0m \x1b[33m' + workerProgress + '%\x1b[0m | ' +
      '\x1b[32mProcessed: ' + stat.processed + '/' + Math.ceil(options.limit / options.threads) + '\x1b[0m | ' +
      '\x1b[35mSuccess: ' + stat.successful + '\x1b[0m | ' +
      '\x1b[31mFailed: ' + stat.failed + '\x1b[0m | ' +
      'Text: ' + stat.withText + ' | ' +
      'Current: ' + currentBill
    );
  });
  
  // Display global stats
  console.log(
    '\n\x1b[1mTotal:\x1b[0m \x1b[32mProcessed: ' + totalProcessed + '/' + options.limit + '\x1b[0m | ' +
    '\x1b[35mSuccess: ' + totalSuccessful + '\x1b[0m | ' +
    '\x1b[31mFailed: ' + totalFailed + '\x1b[0m | ' +
    'Bills with Text: ' + totalWithText + ' | ' +
    'API: ' + totalApiText + ' | PDF: ' + totalPdfText
  );
} 