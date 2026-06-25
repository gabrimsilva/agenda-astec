import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedActivityTypes, seedDefaultAdmin } from "./seed";
import { setupWebSocket } from "./ws";
import { runMigrations } from "./migrate";
import { closeBrowser } from "./browser-pool";

const app = express();
// Reduced from 50MB to 15MB to limit memory usage
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false, limit: '15mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  console.log("🚀 Starting ASTEC server...");
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Port: ${process.env.PORT || '5000'}`);
  console.log(`🗄️  Database URL configured: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
  
  // Run automatic database migrations on startup
  try {
    await runMigrations();
    console.log("✅ Database migrations completed");
  } catch (error: any) {
    console.error("⚠️  Database migration check failed:", error.message);
    console.log("⚠️  Continuing without migrations - database may need manual setup");
  }

  // Seed default activity types before routes initialization
  try {
    await seedActivityTypes();
    console.log("✅ Database seeding completed");
  } catch (error: any) {
    console.error("⚠️  Database seeding failed - app will start without seeded data:", error.message);
    console.log("⚠️  Continuing startup - check database connection if issues persist");
  }

  // Ensure there is always a default admin to log in (idempotent: only creates if missing)
  try {
    await seedDefaultAdmin();
  } catch (error: any) {
    console.error("⚠️  Default admin seeding failed:", error.message);
  }
  
  const server = await registerRoutes(app);
  
  // Setup WebSocket server for real-time telemetry
  setupWebSocket(server);
  
  // Start notification reminder scheduler
  const { startReminderScheduler } = await import("./services/notifications");
  startReminderScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  // reusePort is not supported on Windows (throws ENOTSUP); enable only on non-win32 platforms.
  const listenOptions: { port: number; host: string; reusePort?: boolean } = {
    port,
    host: "0.0.0.0",
  };
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }
  server.listen(listenOptions, () => {
    console.log(`✅ ASTEC server ready and listening on port ${port}`);
    log(`serving on port ${port}`);
  });

  // Graceful shutdown handlers to clean up resources and prevent memory leaks
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    // Stop reminder scheduler
    const { stopReminderScheduler } = await import("./services/notifications");
    stopReminderScheduler();
    
    // Close browser pool (Puppeteer)
    await closeBrowser();
    
    // Close server
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.log('⚠️ Forcing exit after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
