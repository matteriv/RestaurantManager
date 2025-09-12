# Restaurant Management System

## Overview

This is a comprehensive restaurant management system built as a full-stack web application. The system provides complete point-of-sale (POS) functionality, kitchen display system (KDS), customer monitoring, and administrative analytics. It's designed to streamline restaurant operations from order taking to payment processing, with real-time updates across all interfaces.

The application serves multiple user types including waiters, kitchen staff, customers, and managers, each with tailored interfaces optimized for their specific workflows. The system supports offline capabilities for the POS terminal and provides real-time synchronization through WebSocket connections.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for type safety and modern development patterns
- **Vite** as the build tool for fast development and optimized production builds
- **Wouter** for lightweight client-side routing
- **TanStack Query** for server state management, caching, and synchronization
- **shadcn/ui** component library built on Radix UI primitives for consistent, accessible UI components
- **Tailwind CSS** for utility-first styling with custom design tokens

### Backend Architecture
- **Express.js** server with TypeScript for API endpoints and middleware
- **WebSocket Server** using the 'ws' library for real-time communication between different client types (POS, KDS, customer monitors)
- **RESTful API** design with proper HTTP methods and status codes
- **Session-based authentication** using express-session with PostgreSQL storage
- **Replit Auth integration** for user authentication and authorization

### Database Layer
- **PostgreSQL** as the primary database
- **Neon Database** as the serverless PostgreSQL provider
- **Drizzle ORM** for type-safe database operations and schema management
- **Database schema** includes users, menu items, tables, orders, payments, and audit logs
- **Connection pooling** using @neondatabase/serverless for efficient database connections

### Real-time Communication
- **WebSocket-based** real-time updates for order status changes
- **Client type registration** system (pos, kds, customer, admin) for targeted message broadcasting
- **Automatic reconnection** logic with exponential backoff
- **Message queuing** for offline scenarios

### Authentication & Authorization
- **OpenID Connect** integration with Replit for secure authentication
- **Role-based access control** with roles: admin, manager, waiter, cook, cashier
- **Session management** with PostgreSQL session store
- **Audit logging** for sensitive operations (order modifications, cancellations, refunds)

### Offline Capabilities
- **Service Worker** implementation for offline POS functionality
- **Local storage** for order data when disconnected
- **Automatic synchronization** when connection is restored
- **Optimistic UI updates** for better user experience

### State Management
- **TanStack Query** for server state with automatic background refetching
- **React Context** for WebSocket connection state
- **Local React state** for UI interactions and form data
- **Persistent storage** using localStorage for user preferences

### Multi-Interface Design
- **POS Terminal**: Tablet-optimized interface for order taking (table management removed for streamlined product focus)
- **Kitchen Display**: Large screen interface for order preparation tracking
- **Customer Monitor**: Public display showing order status with notifications
- **Admin Panel**: Dashboard for analytics, reporting, and system management
- **Delivery Interface**: Mobile-optimized smartphone interface for order delivery confirmation

### Performance Optimizations
- **Code splitting** at the route level for smaller bundle sizes
- **Image optimization** and lazy loading
- **Database query optimization** with proper indexing
- **Caching strategies** for menu items and static data
- **Debounced API calls** for search and filter operations

## External Dependencies

### Core Framework Dependencies
- **React ecosystem**: react, react-dom, react-router via wouter
- **Build tools**: vite, typescript, esbuild for production builds
- **Styling**: tailwindcss, postcss, autoprefixer

### UI Component Libraries
- **Radix UI**: Complete set of low-level UI primitives (@radix-ui/*)
- **Lucide React**: Icon library for consistent iconography
- **shadcn/ui**: Pre-built component library with Tailwind styling

### Backend Infrastructure
- **Express.js**: Web framework with middleware support
- **WebSocket**: Real-time communication via 'ws' library
- **Session management**: express-session with connect-pg-simple

### Database & ORM
- **Neon Database**: Serverless PostgreSQL hosting (@neondatabase/serverless)
- **Drizzle ORM**: Type-safe database operations (drizzle-orm, drizzle-kit)
- **Database validation**: drizzle-zod for schema validation

### Authentication
- **OpenID Connect**: Authentication via openid-client
- **Passport.js**: Authentication middleware
- **Replit Auth**: Integrated authentication system

### Development Tools
- **TypeScript**: Type safety across the entire stack
- **ESLint/Prettier**: Code formatting and linting
- **Replit plugins**: Development environment integration

### Utility Libraries
- **date-fns**: Date manipulation and formatting
- **zod**: Runtime type validation
- **clsx & tailwind-merge**: Conditional CSS class management
- **nanoid**: Unique ID generation