# Server-Side Caching System

This directory contains context providers that implement efficient data fetching and caching strategies for the application.

## BillStatsContext

The `BillStatsContext` provides bill statistics data to components throughout the application using a two-level caching strategy:

1. **Server-side caching** in the Supabase database
2. **Client-side caching** using SWR

### How It Works

#### Server-Side Cache

- Statistics are stored in a `cached_statistics` table in Supabase
- Data is cached with an expiration time (1 hour by default)
- Only one database query is made per hour, regardless of how many users access the site
- If 1,000,000 different users visit the site, they all read from the same cached data

#### Client-Side Cache

- SWR provides additional client-side caching
- Prevents unnecessary network requests even to fetch the cached data
- Configured not to revalidate on window focus or reconnection
- Refreshes data after the cache period expires

### Implementation Details

1. **Database Table**: `cached_statistics`
   - `id`: Cache key identifier
   - `data`: JSONB field containing the cached data
   - `last_updated`: Timestamp of when the cache was last updated
   - `expires_at`: Timestamp of when the cache expires

2. **API Function**: `getCachedBillStats()`
   - First checks if cached data exists and is valid
   - If valid, returns the cached data without querying the database
   - If expired or missing, fetches fresh data and updates the cache
   - Handles errors gracefully with fallbacks

3. **Context Provider**: `BillStatsProvider`
   - Uses SWR to manage client-side caching and revalidation
   - Provides loading and error states to components
   - Shares the cached data across all components

### Usage

```tsx
// In a component
import { useBillStats } from '@/lib/contexts/BillStatsContext';

const MyComponent = () => {
  const { stats, isLoading, error } = useBillStats();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading statistics</div>;
  
  return (
    <div>
      <p>Total Bills: {stats?.congress118Count + stats?.congress119Count}</p>
      <p>118th Congress: {stats?.congress118Count}</p>
      <p>119th Congress: {stats?.congress119Count}</p>
    </div>
  );
};
```

### Setup

To set up the caching system:

1. Run the database migration:
   ```bash
   # For staging environment
   npm run db:setup:cache:staging
   
   # For production environment
   npm run db:setup:cache:prod
   ```

2. Ensure the `BillStatsProvider` is included in your application:
   ```tsx
   // In main.tsx or similar
   import { BillStatsProvider } from './lib/contexts/BillStatsContext';
   
   ReactDOM.createRoot(document.getElementById("root")!).render(
     <React.StrictMode>
       <ThemeProvider defaultTheme="dark">
         <BillStatsProvider>
           <RouterProvider router={router} />
         </BillStatsProvider>
       </ThemeProvider>
     </React.StrictMode>,
   );
   ```

### Benefits

- **Massive Reduction in Database Load**: Instead of 1,000,000 queries for 1,000,000 users, there's just 1 query per hour
- **Improved Performance**: Faster page loads for all users
- **Reduced Costs**: Lower database usage means lower hosting costs
- **Better Scalability**: The application can handle millions of users without database performance issues
- **Resilience**: If the database is temporarily unavailable, users still see statistics from the cache

### Customization

The cache duration can be adjusted by modifying the `CACHE_TTL_SECONDS` constant in `getCachedBillStats()` function. 