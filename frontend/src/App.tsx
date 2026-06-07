import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Devices from "./app/pages/Devices";
import Zones from "./app/pages/Zones";
import ZoneDetail from "./app/pages/ZoneDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Zones />} />
            <Route path="/zones" element={<Zones />} />
            <Route path="/zones/:id" element={<ZoneDetail />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="*" element={<Devices />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;