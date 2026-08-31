// Menu + retail + press + dish data for The Fly Trap
window.FT_DATA = {
  menuCategories: [
    { id: "eggs", title: "All Things Eggs", sub: "Comes with toast & smashed garlic fried potatoes when logical." },
    { id: "sweet", title: "Oh, Sugar Shack!", sub: null },
    { id: "salads", title: "Green Things", sub: "All salads come with grilled bread." },
    { id: "between", title: "Between Bread", sub: "Sandwiches come with fries, small salad or house spuds & something pickled." },
    { id: "other", title: "Other Stuff", sub: null },
    { id: "sides", title: "B-Sides", sub: "Add-ons & smaller plates." },
    { id: "drinks", title: "Whistle Wetters", sub: null },
  ],
  menuItems: [
    // Eggs
    { cat: "eggs", nm: "Green Eggs and Ham", desc: "Poblano pesto and jack cheese rumbled with eggs, sidled by seared city ham.", price: "14.95" },
    { cat: "eggs", nm: "Veggie Rumble", desc: "Red pepper, carrots, mushrooms, peas, spinach and provolone. Choose eggs or tofu.", price: "13.95", veg: true },
    { cat: "eggs", nm: "The Boot", desc: "Mussolini's fave — a rumble of eggs with fresh mozzarella, basil, tomatoes, & green olives.", price: "13.95" },
    { cat: "eggs", nm: "The Forager", desc: "Wild'n'mild 'shrooms, caramelized onion, smoked gouda & greens rumbled with eggs.", price: "14.95" },
    { cat: "eggs", nm: "Huevos Rancheros", desc: "Two eggs any style, crispy flour tortilla, black beans, jack cheese, jalapeños, pico & sour cream.", price: "13.95" },
    { cat: "eggs", nm: "Cowboy Curtis", desc: "Seared flank steak straddlin' a wildwest sauce, two eggs fried easy to hard & yippee kayay…pick your toast.", price: "18.95" },
    { cat: "eggs", nm: "Eggs ala Boring", desc: "Simply two eggs ($7.95), or two eggs with meat ($9.95).", price: "7.95" },
    { cat: "eggs", nm: "Red Flannel Hash", desc: "Hot spiced beef brisket, potatoes, beets & greens with horseradish-mini scallions.", price: "14.95" },
    { cat: "eggs", nm: "Crab Cakes and Eggs", desc: "Two crab chubs alongside a pair of eggs any style with a green chili tartar.", price: "17.95" },
    { cat: "eggs", nm: "El Burrito Bonito", desc: "Chorizo, scrambled eggs, house spuds & cheddar swaddled in a flour tortilla, topped with pico & sour cream.", price: "15.95" },
    { cat: "eggs", nm: "B.L.A.T.+C.", desc: "An omelette replete with pepper bacon, spinach, avocado, tomato & cheddar.", price: "14.95" },
    { cat: "eggs", nm: "Bocca al Lupo", desc: "Hot Italian sausage, peppers, onion, spinach & provolone stuffed in an omelette.", price: "14.95" },
    { cat: "eggs", nm: "Slacker Especial", desc: "An omelette filled with black beans, cheddar, chips, topped with pico & sour cream.", price: "13.95" },
    // Sweet
    { cat: "sweet", nm: "Gingerbread Waffle", desc: "With sautéed apples, cherries & cinnamon syrup.", price: "11.95", veg: true },
    { cat: "sweet", nm: "Granola", desc: "House mixed nuts, seeds & honey rolled oats with coconut, banana & vanilla yogurt.", price: "9.95", veg: true },
    { cat: "sweet", nm: "Mini-Muffin", desc: "Daily flavor.", price: "0.99", veg: true },
    { cat: "sweet", nm: "Oatmeal", desc: "Plain ($6) or with dried cherries & vanilla ice cream ($7.95).", price: "6.00", veg: true },
    // Salads
    { cat: "salads", nm: "Rob's Chop Chop", desc: "A 'Wunder' not to be missed. Greens, mushrooms, ham, salami, provolone, ceci beans & olives chopped together with creamy herb. Sm $12.95 / Lg $15.95.", price: "12.95" },
    { cat: "salads", nm: "Ensalada de Basura", desc: "Black beans, tomatoes, avocado, cheddar, greens, crispy tortillas, sour cream & guajillo dressing.", price: "15.95" },
    { cat: "salads", nm: "The Echo", desc: "Greens, feta, beets, kalamata olives, red onion, grape tomato, cucumber & chick peas with tomato vinaigrette.", price: "15.95", veg: true },
    { cat: "salads", nm: "House", desc: "Mixed greens, shaved onion, grape tomatoes. Choice of dressing. Side: $3.95.", price: "7.95", veg: true },
    // Sandwiches
    { cat: "between", nm: "B.L.T. & A.", desc: "Pepper bacon, lettuce, tomato & avocado on sourdough with garlic aioli.", price: "14.95" },
    { cat: "between", nm: "Pea Patch Papoose", desc: "Mushrooms, carrots, peppers, spinach, tomatoes & provolone in a flour tortilla with house mustard and poblano herb pesto schmear.", price: "13.95", veg: true },
    { cat: "between", nm: "Charmoula Chicken", desc: "North African spiced chicken thighs, jack cheese, caramelized onion on grilled sourdough with lemony garlic aioli.", price: "14.95" },
    { cat: "between", nm: "The Cheapsteak", desc: "Flank steak on grilled sourdough with swiss, balsamic onions, spinach, tomato & grainy mustard.", price: "18.95" },
    { cat: "between", nm: "Jeremy's Mess", desc: "A toasty mix of salami, sausage, sweet & hot peppers, olives, caramelized onion, hot mustard & provolone on a house roll.", price: "14.95" },
    { cat: "between", nm: "The Paddy Wagon", desc: "Brined brisket sliced thin and served warm with cool cabbage, smoked gouda & caramelized onion on grilled rye with jalapeño mustard.", price: "14.95" },
    { cat: "between", nm: "The E-Z Chi-Z", desc: "A grilled three-cheese on sourdough with kimchi, lil' pink mayo, cheddar & jack, topped with American cheese and baked until bubbling.", price: "12.95" },
    { cat: "between", nm: "The Burger", desc: "A ½ lb. of seasoned ground beef, house roll, Buzz Sauce & all the standard fixin's.", price: "14.95" },
    { cat: "between", nm: "Tempting Tempeh", desc: "Same as the burger, but for our vegetarian friends.", price: "13.95", veg: true },
    { cat: "between", nm: "Red Chili Salmon Burger", desc: "Shaved cucumber, ginger lime aioli & all the standard fixin's.", price: "17.95" },
    // Other
    { cat: "other", nm: "Crab Cake App", desc: "Two crab chubs, red chili greens, green chili tartar.", price: "13.95" },
    { cat: "other", nm: "Fried Rice", desc: "Brown rice, roasted mushrooms, veggies, tofu, red chilies, tamari & sesame. + chicken $15.95 / shrimp $16.95.", price: "14.95", veg: true },
    { cat: "other", nm: "Fire-Breathing Dragon", desc: "Chilled wheat noodles tossed in sambal peanut sauce with snap peas, basil, scallions and pickled cabbage. Grilled chicken or tofu.", price: "15.95" },
    { cat: "other", nm: "Mac Loves Cheese", desc: "Cheddar, smoked gouda & blue with cavatappi pasta, caramelized onion & herbs.", price: "13.95", veg: true },
    { cat: "other", nm: "Lemongrass Faux Bowl", desc: "Lemongrass and Thai chili broth with wheat noodles, sesame, roasted mushrooms, veggies. Chicken/tofu/shrimp.", price: "15.95" },
    { cat: "other", nm: "Howie's Noodles", desc: "Shrimp, fettuccine, cajun cream, tomatoes, scallion and parmesan.", price: "16.95" },
    // Sides
    { cat: "sides", nm: "Daily Soup", desc: "Cup $5.00 · Bowl $6.00.", price: "5.00" },
    { cat: "sides", nm: "House Spuds", desc: "Smashed garlic fried potatoes.", price: "3.95", veg: true },
    { cat: "sides", nm: "Fries", desc: "", price: "3.95", veg: true },
    { cat: "sides", nm: "Side Salad", desc: "Mixed greens, choice of dressing.", price: "3.95", veg: true },
    { cat: "sides", nm: "Toast", desc: "Sourdough, multigrain or rye.", price: "2.95", veg: true },
    { cat: "sides", nm: "Pepper Bacon", desc: "", price: "6.00" },
    { cat: "sides", nm: "Hot Italian Sausage", desc: "", price: "6.00" },
    { cat: "sides", nm: "Detroit Breakfast Links", desc: "", price: "6.00" },
    { cat: "sides", nm: "Grilled City Ham", desc: "", price: "6.00" },
    { cat: "sides", nm: "Chicken Thigh", desc: "", price: "6.00" },
    { cat: "sides", nm: "Tempeh Patty", desc: "", price: "6.00", veg: true },
    { cat: "sides", nm: "Tofu", desc: "", price: "5.00", veg: true },
    { cat: "sides", nm: "Seared Shrimp", desc: "", price: "7.00" },
    { cat: "sides", nm: "Black Beans", desc: "", price: "5.00", veg: true },
    // Drinks
    { cat: "drinks", nm: "Sabbath Coffee Roasters 'Ritual' Blend", desc: "Bottomless cup.", price: "2.95" },
    { cat: "drinks", nm: "Harney & Sons Loose Leaf Tea", desc: "", price: "3.95" },
    { cat: "drinks", nm: "Fresh Squeezed O.J.", desc: "Sm $3.95 · Lg $4.95.", price: "3.95" },
    { cat: "drinks", nm: "Fresh Squeezed Lemonades", desc: "", price: "3.95" },
    { cat: "drinks", nm: "Hot Cocoa", desc: "With whipped cream.", price: "2.95" },
    { cat: "drinks", nm: "Bottled Root Beer", desc: "", price: "2.95" },
    { cat: "drinks", nm: "Rootbeer Float", desc: "", price: "5.95" },
    { cat: "drinks", nm: "Fountain Drinks", desc: "", price: "2.50" },
    { cat: "drinks", nm: "Ito En Iced Green Tea", desc: "", price: "3.50" },
    { cat: "drinks", nm: "Fresh-Brewed Iced Tea", desc: "", price: "2.50" },
    { cat: "drinks", nm: "Arnie Palmer", desc: "Half iced tea, half lemonade.", price: "2.50" },
    { cat: "drinks", nm: "Lil' Can o' V-8", desc: "", price: "2.50" },
    { cat: "drinks", nm: "Grapefruit Juice", desc: "Sm $1.95 · Lg $2.95.", price: "1.95" },
  ],
  // Rotating pull-quotes at the top of the news section. Each is verbatim from a
  // published piece and attributed. Cycled by the PressQuote component.
  pressQuotes: [
    { quote: "A finer diner, in the words of the proprietors — and they're right.", attr: "Molly Abraham · Hour Detroit, 2009" },
    { quote: "There have never been any heartbreaking moments here — just delicious ones.", attr: "Hour Detroit, 2025" },
    { quote: "Not your granddaddy's diner: the inside is sleek, the soundtrack is ska and reggae, and the breakfast is called 'blunch.'", attr: "Food Network Magazine" },
    { quote: "Trade your greasy spoon for chopsticks and get the fattest pho bowl in town.", attr: "Food Network" },
  ],
  // Verified press only, ranked national-first. Every link is the outlet's live
  // original (paywalled dailies still load for human readers) and was fetch-checked
  // 2026-07-13. Years are the piece's publish year. Titles avoid invented headlines.
  press: [
    { year: "2008", outlet: "Food Network", title: "Diners, Drive-Ins and Dives — \"Off the Hook Specials\" (Season 2).", url: "https://www.foodnetwork.com/shows/diners-drive-ins-and-dives/episodes/off-the-hook-specials" },
    { year: "2017", outlet: "Food Network", title: "The Fly Trap — a 'finer diner' with the fattest pho bowl in town.", url: "https://www.foodnetwork.com/restaurants/mi/ferndale/the-fly-trap-restaurant" },
    { year: "2010", outlet: "Food Network Magazine", title: "50 States, 50 Breakfasts — Michigan's pick.", url: "https://www.foodnetwork.com/recipes/photos/50-states-50-breakfasts" },
    { year: "2026", outlet: "Islands", title: "Michigan's funky Ferndale diner — a friendly, creative stop featured by Guy Fieri.", url: "https://www.islands.com/2075049/the-fly-trap-ferndale-michigan-funky-diner-friendly-creative-featured-guy-fieri/" },
    { year: "2009", outlet: "Hour Detroit", title: "Mind, Body & Spirits and The Fly Trap — Molly Abraham's review.", url: "https://www.hourdetroit.com/restaurants-food/mind-body-spirits-and-the-fly-trap/" },
    { year: "2025", outlet: "Hour Detroit", title: "My Longest Relationship Is With a Restaurant.", url: "https://www.hourdetroit.com/restaurants-bars/culture-convo-my-longest-relationship-is-with-a-restaurant/" },
    { year: "2024", outlet: "Crain's Detroit Business", title: "Fly Trap founders return to take over the Ferndale diner.", url: "https://www.crainsdetroit.com/restaurants/fly-trap-founders-return-take-over-ferndale-diner/" },
  ],
  // ===========================================================================
  // THIS WEEK'S SPECIALS + soup/muffin EXTRAS — auto-synced from Toast (the
  // source of truth) by the Toast sync workflow. Do NOT hand-edit the
  // SPECIALS/EXTRAS blocks below: every sync run rewrites them from Toast, so
  // manual edits get overwritten. To change a special, edit it in Toast.
  // See docs/SPECIALS_SYNC.md. The tweaks-panel form is the manual override /
  // emergency path.
  // ===========================================================================
  /* SPECIALS:START */
  sourcePost: "",
  weekOf: "Week of July 6",
  specials: [
    { id: "special-1", name: "The Summer Bishil", desc: "Chana dal, gunpowder spice roasted sweet potatoes, spinach, mushrooms and paneer cheese rolled up in a whole wheat wrap with a dollop of cashew mint chutney🥬.", veg: true, photo: "assets/specials/toast-the-summer-bishil.jpg", price: "14.95" },
  ],
  /* SPECIALS:END */
  /* EXTRAS:START */
  muffinSpecial: { name: "Mini Muffins", flavor: "Lemon Pistachio Crumble🥬", price: "0.99" },
  soupSpecial: { name: "Soup of the Day", flavor: "Smoked Mushroom Bisque 🥬", available: true, cup: "5.00", bowl: "6.00" },
  /* EXTRAS:END */
  // "A few of our favorites" slider. Captions are the labels Sean sent with each
  // photo (he named the files after the caption he wanted); the label is also the
  // image's alt text. Order below is the order the photos arrived.
  dishes: [
    { src: "assets/dishes/the-burger.jpg", label: "Meatloaf Sandwich Special", w: 760, h: 335 },
    { src: "assets/dishes/fried-rice.jpg", label: "Fried Rice", w: 760, h: 364 },
    { src: "assets/dishes/full-bar.jpg", label: "Full Bar", w: 360, h: 480 },
    { src: "assets/dishes/here-we-are.jpg", label: "Here we are!", w: 360, h: 480 },
    { src: "assets/dishes/house-made-sausage.jpg", label: "House Made Sausage", w: 360, h: 480 },
    { src: "assets/dishes/special-smoked-chicken-hash.jpg", label: "Special Smoked Chicken Hash", w: 270, h: 480 },
    { src: "assets/dishes/sweet-special.jpg", label: "Sweet Special", w: 360, h: 480 },
    { src: "assets/dishes/classic.jpg", label: "Classic", w: 480, h: 480 },
    { src: "assets/dishes/wham-jam-strawberry-basil.jpg", label: "Wham! Jam — Strawberry Basil", w: 640, h: 480 },
    { src: "assets/dishes/between-bread-in-the-wild.jpg", label: "Between Bread in the Wild", w: 320, h: 480 },
    { src: "assets/dishes/saag-paneer.jpg", label: "Saag Paneer", w: 360, h: 480 }
  ],
};

// --- Live open/closed status -------------------------------------------------
// Restaurant hours are Mon–Sun 8:00a–3:00p (America/Detroit). The "Open now"
// badge used to be hard-coded; this computes it from the restaurant's local time
// so it reads "Closed" after hours (Sean/Kara feedback item 3).
window.ftOpenNow = function () {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit", hour12: false, hour: "2-digit", minute: "2-digit"
    }).formatToParts(new Date());
    let h = +parts.find((p) => p.type === "hour").value;
    if (h === 24) h = 0; // some engines report midnight as 24
    const mins = h * 60 + +parts.find((p) => p.type === "minute").value;
    return mins >= 480 && mins < 900; // 8:00a (480) – 3:00p (900)
  } catch (e) {
    return false; // Intl/timeZone unavailable — fail closed rather than claim "Open"
  }
};

// Weekday index (0=Sun..6=Sat) at the restaurant's local time. Anchors "today"
// highlighting to America/Detroit so it agrees with the Open-now badge no matter
// what timezone the visitor is in.
window.ftTodayIdx = function () {
  try {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit", weekday: "short"
    }).format(new Date());
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
  } catch (e) {
    return new Date().getDay(); // Intl/timeZone unavailable — visitor-local fallback
  }
};

// React hook: open state that re-checks each minute so the badge flips at 3:00p
// without needing a page reload.
window.useOpenNow = function () {
  const [open, setOpen] = React.useState(window.ftOpenNow());
  React.useEffect(() => {
    const id = setInterval(() => setOpen(window.ftOpenNow()), 60000);
    return () => clearInterval(id);
  }, []);
  return open;
};
