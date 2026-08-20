import { useEffect, useState } from "react";
import { db, auth } from "@/integrations/firebase/client"; // Firebase client
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot, // Real-time listener
  where,
  getCountFromServer, // Efficient way to count documents
  Timestamp, // Type for timestamps
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth"; // Auth state
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// --- 1. IMPORTED new icons ---
import { Package, AlertTriangle, Clock, Plus, List, Users, FileText, Loader2, IndianRupee, TrendingUp } from "lucide-react"; 
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast"; // Import useToast
import { Button } from "@/components/ui/button"; // Import Button


// Interface for Stock Item (simplified for dashboard needs)
interface StockItemData {
    part_name: string;
    car_company: string | null;
    quantity: number;
    low_stock_threshold: number;
    created_at?: Timestamp; // Use Firestore Timestamp
    user_id: string; // Needed for queries
}
// Interface including Firestore ID
interface StockItem extends StockItemData {
    id: string;
}

// Interface for Dashboard Stats
interface DashboardStats {
  totalParts: number;
  lowStockCount: number;
  totalCustomers: number;
  pendingUdhaari: number;
}

// --- 2. NEW: Interface for Today's Stats ---
interface TodayStats {
  sales: number;
  profit: number;
}
// ------------------------------------------

const Dashboard = () => {
  const { toast } = useToast(); // Initialize toast
  const [stats, setStats] = useState<DashboardStats>({
    totalParts: 0,
    lowStockCount: 0,
    totalCustomers: 0,
    pendingUdhaari: 0, 
  });
  
  // --- 3. NEW: State for new features ---
  const [todayStats, setTodayStats] = useState<TodayStats>({ sales: 0, profit: 0 });
  const [currentDate, setCurrentDate] = useState<string>("");
  // ------------------------------------

  const [recentParts, setRecentParts] = useState<StockItem[]>([]); // Use StockItem interface
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // --- 4. NEW: useEffect to set the current date ---
  useEffect(() => {
    const today = new Date();
    // Formats the date as "Wednesday, 5 November 2025"
    setCurrentDate(today.toLocaleDateString("en-IN", {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }));
  }, []);
  // -----------------------------------------------

  // Listen for auth changes
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        // If user logs out, clear data and stop loading
        setStats({ totalParts: 0, lowStockCount: 0, totalCustomers: 0, pendingUdhaari: 0 });
        setRecentParts([]);
        setTodayStats({ sales: 0, profit: 0 }); // Clear today's stats
        setLoading(false);
      }
    });
    return () => unsubscribeAuth(); // Cleanup auth listener
  }, []);


  // Fetch data when user is logged in
  useEffect(() => {
    if (!currentUser) {
      setLoading(false); // Not loading if no user
      return; // Don't fetch if not logged in
    }

    setLoading(true);
    let unsubscribeStock: (() => void) | null = null;
    let unsubscribeTodayOrders: (() => void) | null = null; // --- 5. NEW: Unsubscriber for today's orders ---

    const fetchDashboardData = async () => {
      let initialLoadComplete = false;
      try {
        // --- Fetch Counts using getCountFromServer (run once) ---
        const stockCol = collection(db, "stock");
        const customersCol = collection(db, "customers");
        const udhaariCol = collection(db, "udhaari"); 

        const stockQueryCount = query(stockCol, where("user_id", "==", currentUser.uid));
        const customersQueryCount = query(customersCol, where("user_id", "==", currentUser.uid));
        
        // --- THIS IS THE FIX ---
        // We query for udhaari records where the totalPending is greater than 0,
        // which matches the logic in Udhaari.tsx.
        const udhaariQueryCount = query(udhaariCol,
            where("user_id", "==", currentUser.uid),
            where("totalPending", ">", 0) 
        );
        // -----------------------

        const [stockSnap, customersSnap, udhaariSnap] = await Promise.all([
             getCountFromServer(stockQueryCount),
             getCountFromServer(customersQueryCount),
             getCountFromServer(udhaariQueryCount)
        ]);

        const initialTotalParts = stockSnap.data().count;
        const initialTotalCustomers = customersSnap.data().count;
        const initialPendingUdhaari = udhaariSnap.data().count;

        // --- Set up Real-time listener for ALL Stock Data ---
        const allStockQueryRealtime = query(
          stockCol,
          where("user_id", "==", currentUser.uid),
          orderBy("created_at", "desc")
        );

        unsubscribeStock = onSnapshot(allStockQueryRealtime, (snapshot) => {
          const fetchedStockItems: StockItem[] = [];
          let lowStockCounter = 0;

          snapshot.forEach((doc) => {
             const data = doc.data() as StockItemData;
             const itemWithId = { id: doc.id, ...data };
             fetchedStockItems.push(itemWithId);
             if (itemWithId.quantity <= (itemWithId.low_stock_threshold ?? 0)) {
                 lowStockCounter++;
             }
          });

          setRecentParts(fetchedStockItems.slice(0, 5));

          setStats({
            totalParts: initialTotalParts, 
            lowStockCount: lowStockCounter, 
            totalCustomers: initialTotalCustomers, 
            pendingUdhaari: initialPendingUdhaari, 
          });

          if (!initialLoadComplete) {
              setLoading(false);
              initialLoadComplete = true;
          }

        }, (error) => {
           console.error("Error fetching stock data:", error);
           toast({ title: "Error", description: "Could not fetch stock data.", variant: "destructive"});
           setLoading(false); 
        });

        // --- 6. NEW: Set up Real-time listener for Today's Orders ---
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const startTimestamp = Timestamp.fromDate(todayStart);
        const endTimestamp = Timestamp.fromDate(todayEnd);

        const ordersCol = collection(db, "orders");
        // We query by 'invoice_date' as that's what the user sets
        const todayOrdersQuery = query(
          ordersCol,
          where("user_id", "==", currentUser.uid),
          where("invoice_date", ">=", startTimestamp),
          where("invoice_date", "<=", endTimestamp)
        );

        unsubscribeTodayOrders = onSnapshot(todayOrdersQuery, (snapshot) => {
          let totalSales = 0;
          let totalProfit = 0;
          snapshot.forEach(doc => {
            const order = doc.data();
            totalSales += order.total_amount || 0;
            // Assumes 'profit_amount' is stored on the order document
            totalProfit += order.profit_amount || 0; 
          });
          setTodayStats({ sales: totalSales, profit: totalProfit });
        }, (error) => {
          console.error("Error fetching today's orders:", error);
          toast({ title: "Error", description: "Could not load today's sales data.", variant: "destructive"});
        });
        // ----------------------------------------------------

      } catch (error: any) {
        console.error("Error fetching dashboard counts:", error);
        toast({
          title: "Error Loading Stats",
          description: error.message || "Could not load dashboard statistics.",
          variant: "destructive",
        });
        setLoading(false); 
      }
    };

    fetchDashboardData();

    // Cleanup function
    return () => {
      if (unsubscribeStock) {
        unsubscribeStock();
      }
      // --- 7. NEW: Cleanup today's order listener ---
      if (unsubscribeTodayOrders) {
        unsubscribeTodayOrders();
      }
      // -----------------------------------------
    };

  }, [currentUser, toast]); 


  // --- Stat Card Definitions ---
  const statCards = [
    { title: "Total Parts", value: stats.totalParts, icon: Package, color: "text-blue-600", bgColor: "bg-blue-100", link: "/parts" },
    { title: "Low Stock Alerts", value: stats.lowStockCount, icon: AlertTriangle, color: "text-red-600", bgColor: "bg-red-100", link: "/parts?filter=low_stock"}, 
    { title: "Total Customers", value: stats.totalCustomers, icon: Users, color: "text-green-600", bgColor: "bg-green-100", link: "/customers" },
    { title: "Pending Udhaari", value: stats.pendingUdhaari, icon: FileText, color: "text-yellow-600", bgColor: "bg-yellow-100", link: "/udhaari?filter=Pending%2CPartially+Paid"},
  ];

 // --- Quick Actions ---
  const quickActions = [
    { title: "Add New Stock", description: "Add a new part to inventory", icon: Plus, link: "/add-stock" },
    { title: "View All Parts", description: "Browse complete inventory", icon: List, link: "/parts" },
    { title: "Customers", description: "Manage customer records", icon: Users, link: "/customers" },
    { title: "Udhaari Summary", description: "Track pending payments", icon: FileText, link: "/udhaari" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          {/* --- 8. NEW: Added Current Date --- */}
          <p className="text-lg text-muted-foreground">{currentDate}</p>
          {/* ---------------------------------- */}
        </div>
        
        {/* --- 9. NEW: Today's Stats Section --- */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Today's Business</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Today Sales */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Today's Sales</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : `₹${todayStats.sales.toFixed(2)}`}
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <IndianRupee className="w-6 h-6 text-green-600" />
                </div>
              </CardContent>
            </Card>

            {/* Today Profit */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Today's Profit</p>

                  <p
                    className={`text-3xl font-bold ${
                      todayStats.profit > 0
                        ? "text-green-600"
                        : todayStats.profit < 0
                        ? "text-red-600"
                        : "text-gray-600"
                    }`}
                  >
                    {loading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : todayStats.profit < 0 ? (
                      `-₹${Math.abs(todayStats.profit).toFixed(2)}`
                    ) : (
                      `₹${todayStats.profit.toFixed(2)}`
                    )}
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg ${
                    todayStats.profit > 0
                      ? "bg-green-100"
                      : todayStats.profit < 0
                      ? "bg-red-100"
                      : "bg-gray-200"
                  }`}
                >
                  <TrendingUp
                    className={`w-6 h-6 ${
                      todayStats.profit > 0
                        ? "text-green-600"
                        : todayStats.profit < 0
                        ? "text-red-600"
                        : "text-gray-600"
                    }`}
                  />
                </div>

              </CardContent>
            </Card>

          </div>
        </div>
        {/* ------------------------------------- */}


        {/* --- 10. MODIFIED: Added header to this section --- */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Overall Inventory</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Link 
                  key={stat.title} 
                  to={stat.link} // We now use a simple URL link
                  className="block hover:no-underline"
                >
                  <Card className="hover:shadow-lg transition-shadow duration-300 h-full">
                    <CardContent className="p-6 flex flex-col justify-between h-full"> 
                      <div className="flex items-center justify-between mb-2"> 
                         <div>
                           <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                           <p className="text-3xl font-bold">{loading ? <Loader2 className="w-6 h-6 animate-spin"/> : stat.value}</p>
                         </div>
                         <div className={`${stat.bgColor} p-3 rounded-lg`}>
                           <Icon className={`w-6 h-6 ${stat.color}`} />
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
        {/* --------------------------------------------------- */}

        {/* Main Content Area (Unchanged) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link key={action.title} to={action.link}>
                        <Card className="hover:shadow-md hover:border-primary transition-all cursor-pointer h-full">
                          <CardContent className="p-4 flex items-start gap-3">
                             <div className="bg-primary/10 p-2 rounded-lg mt-1">
                               <Icon className="w-5 h-5 text-primary" />
                             </div>
                             <div>
                               <h3 className="font-semibold mb-1">{action.title}</h3>
                               <p className="text-sm text-muted-foreground">{action.description}</p>
                             </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" /> Recent Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                 <div className="flex justify-center items-center h-20"><Loader2 className="w-6 h-6 animate-spin text-primary"/></div>
              ) : recentParts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No recent parts added.</p>
              ) : (
                <div className="space-y-3">
                  {recentParts.map((part) => (
                    <div key={part.id} className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-medium text-sm truncate">{part.part_name}</p>
                        <p className="text-xs text-muted-foreground">{part.car_company || 'N/A'}</p>
                      </div>
                      <Badge variant={part.quantity <= (part.low_stock_threshold ?? 0) ? "destructive" : "secondary"} className="flex-shrink-0">
                        Qty: {part.quantity}
                      </Badge>
                    </div>
                  ))}
                   {stats.totalParts > 5 && (
                       <div className="pt-3 text-center">
                           <Link to="/parts">
                               <Button variant="link" size="sm">View All Parts</Button>
                           </Link>
                       </div>
                   )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;