import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";

// Decode Google Maps encoded polyline to array of coordinates
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const coordinates: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return coordinates;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/categories", async (_req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/locations", async (_req, res) => {
    try {
      const locations = await storage.getLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.get("/api/locations/:id", async (req, res) => {
    try {
      const location = await storage.getLocationById(req.params.id);
      if (!location) {
        return res.status(404).json({ error: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      console.error("Error fetching location:", error);
      res.status(500).json({ error: "Failed to fetch location" });
    }
  });

  app.get("/api/locations/category/:categoryId", async (req, res) => {
    try {
      const locations = await storage.getLocationsByCategory(req.params.categoryId);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations by category:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.get("/api/locations/nearby", async (req, res) => {
    try {
      const { lat, lng, radius = "5" } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "Latitude and longitude are required" });
      }
      const locations = await storage.getNearbyLocations(
        parseFloat(lat as string),
        parseFloat(lng as string),
        parseFloat(radius as string)
      );
      res.json(locations);
    } catch (error) {
      console.error("Error fetching nearby locations:", error);
      res.status(500).json({ error: "Failed to fetch nearby locations" });
    }
  });

  app.post("/api/locations", async (req, res) => {
    try {
      const location = await storage.createLocation(req.body);
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  app.put("/api/locations/:id", async (req, res) => {
    try {
      const location = await storage.updateLocation(req.params.id, req.body);
      if (!location) {
        return res.status(404).json({ error: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.delete("/api/locations/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteLocation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Location not found" });
      }
      res.json({ success: true, message: "Location deleted" });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  app.get("/api/admin/locations", async (_req, res) => {
    try {
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching all locations:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.get("/api/regions", async (_req, res) => {
    try {
      const regions = await storage.getRegions();
      res.json(regions);
    } catch (error) {
      console.error("Error fetching regions:", error);
      res.status(500).json({ error: "Failed to fetch regions" });
    }
  });

  app.get("/api/routes", async (_req, res) => {
    try {
      const routes = await storage.getRoutes();
      res.json(routes);
    } catch (error) {
      console.error("Error fetching routes:", error);
      res.status(500).json({ error: "Failed to fetch routes" });
    }
  });

  app.get("/api/routes/:id", async (req, res) => {
    try {
      const route = await storage.getRouteById(req.params.id);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      const stops = await storage.getRouteStops(req.params.id);
      res.json({ ...route, stops });
    } catch (error) {
      console.error("Error fetching route:", error);
      res.status(500).json({ error: "Failed to fetch route" });
    }
  });

  app.post("/api/routes", async (req, res) => {
    try {
      const route = await storage.createRoute(req.body);
      res.status(201).json(route);
    } catch (error) {
      console.error("Error creating route:", error);
      res.status(500).json({ error: "Failed to create route" });
    }
  });

  app.post("/api/routes/:routeId/stops", async (req, res) => {
    try {
      const stop = await storage.createRouteStop({
        ...req.body,
        routeId: req.params.routeId,
      });
      res.status(201).json(stop);
    } catch (error) {
      console.error("Error creating route stop:", error);
      res.status(500).json({ error: "Failed to create route stop" });
    }
  });

  app.get("/api/user-routes", async (req, res) => {
    try {
      const ownerId = req.query.ownerId as string;
      if (!ownerId) {
        return res.status(400).json({ error: "Owner ID is required" });
      }
      const routes = await storage.getRoutesByOwner(ownerId);
      res.json(routes);
    } catch (error) {
      console.error("Error fetching user routes:", error);
      res.status(500).json({ error: "Failed to fetch user routes" });
    }
  });

  app.post("/api/user-routes", async (req, res) => {
    try {
      const { ownerId, name, description } = req.body;
      if (!ownerId || !name) {
        return res.status(400).json({ error: "Owner ID and name are required" });
      }
      const timestamp = Date.now();
      const slug = `user-route-${timestamp}`;
      const route = await storage.createRoute({
        name,
        slug,
        description: description || "My custom route",
        estimatedDurationMinutes: 0,
        distanceMeters: 0,
        difficulty: "easy",
        ownerId,
        isEditable: true,
      });
      res.status(201).json(route);
    } catch (error) {
      console.error("Error creating user route:", error);
      res.status(500).json({ error: "Failed to create user route" });
    }
  });

  app.post("/api/routes/:routeId/copy", async (req, res) => {
    try {
      const { ownerId, name } = req.body;
      if (!ownerId) {
        return res.status(400).json({ error: "Owner ID is required" });
      }
      const originalRoute = await storage.getRouteById(req.params.routeId);
      if (!originalRoute) {
        return res.status(404).json({ error: "Route not found" });
      }
      const newName = name || `${originalRoute.name} (My Copy)`;
      const copiedRoute = await storage.copyRoute(req.params.routeId, ownerId, newName);
      res.status(201).json(copiedRoute);
    } catch (error) {
      console.error("Error copying route:", error);
      res.status(500).json({ error: "Failed to copy route" });
    }
  });

  app.put("/api/user-routes/:routeId", async (req, res) => {
    try {
      const route = await storage.getRouteById(req.params.routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      if (!route.isEditable) {
        return res.status(403).json({ error: "Cannot edit system routes" });
      }
      const { ownerId } = req.body;
      if (route.ownerId !== ownerId) {
        return res.status(403).json({ error: "Not authorized to edit this route" });
      }
      const updated = await storage.updateRoute(req.params.routeId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating user route:", error);
      res.status(500).json({ error: "Failed to update user route" });
    }
  });

  app.delete("/api/user-routes/:routeId", async (req, res) => {
    try {
      const route = await storage.getRouteById(req.params.routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      if (!route.isEditable) {
        return res.status(403).json({ error: "Cannot delete system routes" });
      }
      const ownerId = req.query.ownerId as string;
      if (route.ownerId !== ownerId) {
        return res.status(403).json({ error: "Not authorized to delete this route" });
      }
      await storage.deleteRoute(req.params.routeId);
      res.json({ success: true, message: "Route deleted" });
    } catch (error) {
      console.error("Error deleting user route:", error);
      res.status(500).json({ error: "Failed to delete user route" });
    }
  });

  app.post("/api/user-routes/:routeId/stops", async (req, res) => {
    try {
      const route = await storage.getRouteById(req.params.routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      if (!route.isEditable) {
        return res.status(403).json({ error: "Cannot modify system routes" });
      }
      const { ownerId, locationId, orderIndex } = req.body;
      if (route.ownerId !== ownerId) {
        return res.status(403).json({ error: "Not authorized to modify this route" });
      }
      const existingStops = await storage.getRouteStops(req.params.routeId);
      const newOrderIndex = orderIndex !== undefined ? orderIndex : existingStops.length;
      const stop = await storage.createRouteStop({
        routeId: req.params.routeId,
        locationId,
        orderIndex: newOrderIndex,
      });
      res.status(201).json(stop);
    } catch (error) {
      console.error("Error adding stop to route:", error);
      res.status(500).json({ error: "Failed to add stop to route" });
    }
  });

  app.delete("/api/user-routes/:routeId/stops/:stopId", async (req, res) => {
    try {
      const route = await storage.getRouteById(req.params.routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      if (!route.isEditable) {
        return res.status(403).json({ error: "Cannot modify system routes" });
      }
      const ownerId = req.query.ownerId as string;
      if (route.ownerId !== ownerId) {
        return res.status(403).json({ error: "Not authorized to modify this route" });
      }
      const deleted = await storage.deleteRouteStop(req.params.stopId);
      if (!deleted) {
        return res.status(404).json({ error: "Stop not found" });
      }
      res.json({ success: true, message: "Stop removed" });
    } catch (error) {
      console.error("Error removing stop from route:", error);
      res.status(500).json({ error: "Failed to remove stop from route" });
    }
  });

  app.put("/api/user-routes/:routeId/stops/reorder", async (req, res) => {
    try {
      const route = await storage.getRouteById(req.params.routeId);
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      if (!route.isEditable) {
        return res.status(403).json({ error: "Cannot modify system routes" });
      }
      const { ownerId, stopOrders } = req.body;
      if (route.ownerId !== ownerId) {
        return res.status(403).json({ error: "Not authorized to modify this route" });
      }
      if (!stopOrders || !Array.isArray(stopOrders)) {
        return res.status(400).json({ error: "stopOrders array is required" });
      }
      await storage.reorderRouteStops(req.params.routeId, stopOrders);
      const updatedStops = await storage.getRouteStops(req.params.routeId);
      res.json({ success: true, stops: updatedStops });
    } catch (error) {
      console.error("Error reordering route stops:", error);
      res.status(500).json({ error: "Failed to reorder route stops" });
    }
  });

  app.post("/api/seed", async (_req, res) => {
    try {
      const existingCategories = await storage.getCategories();
      if (existingCategories.length > 0) {
        return res.json({ message: "Database already seeded" });
      }

      const ghost = await storage.createCategory({
        name: "Ghosts & Hauntings",
        slug: "ghost",
        color: "#9B8AA4",
        iconName: "cloud",
        description: "Spectral encounters and haunted locations",
      });

      const folklore = await storage.createCategory({
        name: "Folklore & Legends",
        slug: "folklore",
        color: "#7A8450",
        iconName: "book-open",
        description: "Ancient stories and mythical tales",
      });

      const historical = await storage.createCategory({
        name: "Historical Events",
        slug: "historical",
        color: "#8B7355",
        iconName: "clock",
        description: "Significant moments in history",
      });

      const fortean = await storage.createCategory({
        name: "Fortean Phenomena",
        slug: "fortean",
        color: "#6B5B8E",
        iconName: "eye",
        description: "Unexplained and mysterious occurrences",
      });

      const london = await storage.createRegion({
        name: "London",
        slug: "london",
        description: "The historic capital of England",
        isFree: true,
      });

      const seedLocations = [
        {
          name: "Tower of London",
          slug: "tower-of-london",
          description: "A historic castle with centuries of dark history and numerous ghost sightings.",
          story: "The Tower of London, built in 1066, has served as a royal palace, prison, and execution site. Among its most famous ghosts is Anne Boleyn, the second wife of Henry VIII, who was beheaded here in 1536. Guards and visitors have reported seeing her headless figure walking the Tower grounds, particularly near the Chapel of St Peter ad Vincula where she is buried. The ghost of Lady Jane Grey, the 'Nine Days Queen', has also been spotted, especially around the anniversary of her execution. Perhaps most chilling are the reports of the two young princes, Edward V and his brother Richard, who disappeared in the Tower in 1483 and are believed to have been murdered. Their small, sad figures have been seen holding hands in various parts of the fortress.",
          latitude: 51.5081,
          longitude: -0.0759,
          address: "Tower of London, London EC3N 4AB",
          categoryId: ghost.id,
          regionId: london.id,
          sourceAttribution: "Historic Royal Palaces",
        },
        {
          name: "Highgate Cemetery",
          slug: "highgate-cemetery",
          description: "Victorian cemetery famous for the Highgate Vampire legend and supernatural occurrences.",
          story: "Highgate Cemetery, opened in 1839, became the center of a vampire panic in the late 1960s and early 1970s. Local residents reported seeing a tall, dark figure with hypnotic eyes gliding through the overgrown graves. The 'Highgate Vampire' captured public imagination when self-proclaimed vampire hunters held vigils and searches. While skeptics attributed the sightings to foxes and overactive imaginations, the cemetery's Gothic atmosphere—with its crumbling monuments, Egyptian Avenue, and Circle of Lebanon—continues to inspire supernatural speculation. Notable residents include Karl Marx, Douglas Adams, and Christina Rossetti, and many visitors report feelings of being watched or sudden temperature drops in certain areas.",
          latitude: 51.5677,
          longitude: -0.1467,
          address: "Swain's Lane, London N6 6PJ",
          categoryId: fortean.id,
          regionId: london.id,
          sourceAttribution: "Friends of Highgate Cemetery",
        },
        {
          name: "The Ten Bells",
          slug: "the-ten-bells",
          description: "Historic Spitalfields pub associated with Jack the Ripper and Victorian London's dark past.",
          story: "The Ten Bells pub on Commercial Street has stood since 1752, but its notoriety stems from its connection to Jack the Ripper. At least two of the Ripper's victims—Annie Chapman and Mary Jane Kelly—were known to drink here before their murders in 1888. The pub's upper floors, once used as doss houses, are said to be haunted by a woman in Victorian dress, believed by some to be the spirit of Annie Chapman herself. Staff have reported glasses moving on their own, sudden cold spots, and the sound of footsteps on empty staircases. The pub embraces its dark heritage while serving as a reminder of Whitechapel's grim Victorian history.",
          latitude: 51.5198,
          longitude: -0.0744,
          address: "84 Commercial Street, London E1 6LY",
          categoryId: ghost.id,
          regionId: london.id,
          sourceAttribution: "Jack the Ripper Historical Society",
        },
        {
          name: "London Stone",
          slug: "london-stone",
          description: "Ancient limestone block steeped in legend, said to be the foundation of London's destiny.",
          story: "The London Stone is a block of oolitic limestone that has sat in the city for over 800 years, though some legends claim it dates back to ancient times. Medieval chronicles suggested it was brought to Britain by Brutus of Troy, the legendary founder of London. Others believed it was the stone from which King Arthur drew Excalibur. A prophecy attributed to John Dee states 'So long as the Stone of Brutus is safe, so long shall London flourish.' Jack Cade, leader of a 1450 rebellion, struck the stone with his sword upon entering the city, claiming it made him 'Lord of London.' Now housed in Cannon Street, this unassuming relic continues to captivate those who sense the ancient power it represents.",
          latitude: 51.5115,
          longitude: -0.0903,
          address: "111 Cannon Street, London EC4N 5AR",
          categoryId: folklore.id,
          regionId: london.id,
          sourceAttribution: "Museum of London",
        },
        {
          name: "Boudicca's Grave",
          slug: "boudiccas-grave",
          description: "Legendary burial site of the warrior queen beneath Platform 10 at King's Cross.",
          story: "Legend has it that the great warrior queen Boudicca is buried beneath Platform 10 at King's Cross Station. After leading her famous revolt against Roman occupation in 60-61 AD, Boudicca died—whether by poison, illness, or in battle remains disputed. Victorian antiquarians speculated that her body was buried at the site of her final battle against the Romans, which some placed near Battle Bridge (now King's Cross). While there is no archaeological evidence to support this claim, the legend persists. Some railway workers have reported unexplained occurrences on Platform 10, including the sound of horses' hooves and the clash of weapons. Whether myth or memory, Boudicca's spirit seems to linger in this busy transport hub.",
          latitude: 51.5309,
          longitude: -0.1233,
          address: "King's Cross Station, London N1 9AL",
          categoryId: folklore.id,
          regionId: london.id,
          sourceAttribution: "London Legends Archive",
        },
        {
          name: "The Grenadier",
          slug: "the-grenadier",
          description: "Allegedly London's most haunted pub, home to the ghost of a soldier who died gambling.",
          story: "Tucked away in Wilton Row, The Grenadier dates from 1720 and was once the officers' mess for the Duke of Wellington's regiment. The pub is said to be haunted by a young guardsman named Cedric who was caught cheating at cards and beaten to death by his fellow soldiers. His ghost is most active in September, the month of his murder. Manifestations include objects moving by themselves, sudden temperature drops, rattling bottles, and a shadowy figure in period military dress. Visitors leave coins stuck to the ceiling to appease Cedric's spirit. The pub's secluded location—down a cobbled mews—adds to its supernatural atmosphere.",
          latitude: 51.5027,
          longitude: -0.1528,
          address: "18 Wilton Row, London SW1X 7NR",
          categoryId: ghost.id,
          regionId: london.id,
          sourceAttribution: "Haunted Britain Database",
        },
        {
          name: "Spring-Heeled Jack Sighting",
          slug: "spring-heeled-jack",
          description: "Site of the infamous 1838 encounter with a devil-like figure that could leap over walls.",
          story: "In February 1838, Jane Alsop answered a knock at her door in Bearbinder Lane, Bow. A cloaked figure claiming to be a policeman asked for a light. When Jane returned with a candle, the figure threw off his cloak, revealing a tight-fitting white costume, pointed ears, and glowing eyes. He breathed blue and white flames at her and attacked with metallic claws. Jane's sister saved her by pulling her inside. This was the most famous encounter with Spring-Heeled Jack, a mysterious figure who terrorized Victorian London with his supernatural leaping ability and diabolical appearance. Sightings continued for decades across Britain. Whether mass hysteria, elaborate pranks, or something truly unexplained, Spring-Heeled Jack became one of Victorian England's most enduring mysteries.",
          latitude: 51.5284,
          longitude: -0.0293,
          address: "Bearbinder Lane (now Bow Road), London E3",
          categoryId: fortean.id,
          regionId: london.id,
          sourceAttribution: "Fortean Times Archives",
        },
        {
          name: "Execution Dock",
          slug: "execution-dock",
          description: "Historic site where pirates were hanged and left to rot, their ghosts still seen at low tide.",
          story: "For over 400 years, pirates, smugglers, and mutineers were executed at Execution Dock in Wapping. The condemned were hanged at low tide using a short drop, causing a slow, agonizing death. Their bodies were then left until three tides had washed over them—a ritual to demonstrate Admiralty jurisdiction over maritime crimes. The most famous execution was that of Captain William Kidd in 1701, whose tarred body was displayed in a gibbet for three years as a warning to others. Today, at low tide, visitors report seeing phantom figures along the foreshore and hearing the creak of gallows and the jeering of crowds. The Captain Kidd pub nearby marks the approximate location.",
          latitude: 51.5066,
          longitude: -0.0545,
          address: "Wapping High Street, London E1W 2NJ",
          categoryId: historical.id,
          regionId: london.id,
          sourceAttribution: "Port of London Authority Archives",
        },
        {
          name: "The Black Dog of Newgate",
          slug: "black-dog-newgate",
          description: "Phantom hound said to appear before executions at the site of the notorious prison.",
          story: "Newgate Prison, which stood on the site now occupied by the Old Bailey, was notorious for its brutality and squalor. During a famine in the reign of Henry III, starving prisoners allegedly killed and ate a scholar accused of sorcery. Shortly after, a monstrous black dog with eyes of fire appeared in the prison, terrorizing and killing inmates. The dog was said to appear before executions, padding silently down the corridors or being seen by the condemned in their final hours. Even after the prison's demolition in 1904, the Black Dog of Newgate has been reported in Amen Court nearby, where a dark, amorphous shape is sometimes seen crawling along the walls on quiet nights.",
          latitude: 51.5157,
          longitude: -0.1017,
          address: "Old Bailey, London EC4M 7EH",
          categoryId: folklore.id,
          regionId: london.id,
          sourceAttribution: "London Folklore Society",
        },
        {
          name: "Cleopatra's Needle",
          slug: "cleopatras-needle",
          description: "Ancient Egyptian obelisk said to be cursed, with mysterious suicide connections.",
          story: "Despite its name, Cleopatra's Needle has no connection to the famous queen—it was created 1,000 years before her reign. This 3,500-year-old obelisk was transported from Egypt in 1878, a journey that nearly ended in disaster when the ship carrying it sank in a Bay of Biscay storm, killing six sailors. Since its erection on the Victoria Embankment, the monument has been associated with a disproportionate number of suicides in its vicinity. Witnesses have reported seeing a ghostly naked figure running toward the obelisk before diving into the Thames and vanishing. Others describe strange moaning sounds and the laughter of unseen children. The bronze sphinxes guarding the needle bear shrapnel scars from a WWI Zeppelin raid, adding another layer of dark history.",
          latitude: 51.5083,
          longitude: -0.1165,
          address: "Victoria Embankment, London WC2N 6PB",
          categoryId: fortean.id,
          regionId: london.id,
          sourceAttribution: "Thames Mysteries Archive",
        },
        {
          name: "Bleeding Heart Yard",
          slug: "bleeding-heart-yard",
          description: "Courtyard named after a grisly 17th century murder with demonic connections.",
          story: "This small courtyard in Clerkenwell takes its name from a gruesome legend. In January 1626, Lady Elizabeth Hatton attended a ball at Hatton House. During the evening, she was seen dancing with a handsome stranger believed by some to be the Devil himself. At midnight, a scream was heard, and guests found the courtyard empty save for Lady Elizabeth's body—torn limb from limb, her heart still pumping blood onto the cobblestones. The mysterious stranger was never found. Some say the Devil had come to collect on a pact made by Lady Elizabeth's husband, Sir Christopher Hatton. The yard still exists today, home to restaurants and offices, but those who work there late at night sometimes report the sound of a woman's scream and a faint smell of brimstone.",
          latitude: 51.5219,
          longitude: -0.1079,
          address: "Bleeding Heart Yard, London EC1N 8SJ",
          categoryId: folklore.id,
          regionId: london.id,
          sourceAttribution: "Clerkenwell Historical Society",
        },
        {
          name: "The Plague Pits of Aldgate",
          slug: "plague-pits-aldgate",
          description: "Mass graves from the Great Plague, now beneath modern streets with reported hauntings.",
          story: "During the Great Plague of 1665, when around 100,000 Londoners perished, mass graves were dug throughout the city to cope with the overwhelming number of dead. One of the largest plague pits lies beneath the streets around Aldgate station. When the Underground was being constructed in the 1870s, workers uncovered thousands of skeletons and reported strange experiences—tools moving on their own, unexplained illness, and feelings of overwhelming dread. Today, Tube workers on the Circle Line sometimes report seeing a figure in 17th-century dress on the platforms late at night, or hearing the cries of plague victims echoing through the tunnels. Some believe disturbing the dead has released restless spirits into the modern world.",
          latitude: 51.5141,
          longitude: -0.0755,
          address: "Aldgate Station, London EC3N 1AH",
          categoryId: ghost.id,
          regionId: london.id,
          sourceAttribution: "Transport for London Heritage",
        },
      ];

      for (const loc of seedLocations) {
        await storage.createLocation(loc);
      }

      const route1 = await storage.createRoute({
        name: "Haunted City Walk",
        slug: "haunted-city-walk",
        description: "Explore the ghostly corners of the City of London, from ancient plague pits to execution sites.",
        estimatedDurationMinutes: 90,
        distanceMeters: 3200,
        difficulty: "easy",
        regionId: london.id,
      });

      const locations = await storage.getLocations();
      const cityLocations = locations.filter(l => 
        ["tower-of-london", "plague-pits-aldgate", "execution-dock", "london-stone", "black-dog-newgate"].includes(l.slug)
      );

      for (let i = 0; i < cityLocations.length; i++) {
        await storage.createRouteStop({
          routeId: route1.id,
          locationId: cityLocations[i].id,
          orderIndex: i,
        });
      }

      res.status(201).json({ message: "Database seeded successfully" });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ error: "Failed to seed database" });
    }
  });

  // Google Maps Directions API endpoint for walking routes
  app.post("/api/directions/walking", async (req, res) => {
    try {
      const { waypoints } = req.body;
      
      if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
        return res.status(400).json({ error: "At least 2 waypoints are required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      // For routes with more than 2 waypoints, we need to split them into segments
      // or use the waypoints parameter in the Directions API
      const origin = waypoints[0];
      const destination = waypoints[waypoints.length - 1];
      const intermediateWaypoints = waypoints.slice(1, -1);

      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=walking&key=${apiKey}`;

      // Add intermediate waypoints if any
      if (intermediateWaypoints.length > 0) {
        const waypointsParam = intermediateWaypoints
          .map(wp => `${wp.latitude},${wp.longitude}`)
          .join('|');
        url += `&waypoints=${encodeURIComponent(waypointsParam)}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== "OK") {
        console.error("Directions API error:", data.status, data.error_message);
        return res.status(400).json({ 
          error: "Failed to get directions", 
          details: data.status,
          message: data.error_message 
        });
      }

      if (!data.routes || data.routes.length === 0) {
        return res.status(404).json({ error: "No route found" });
      }

      // Decode polylines from each leg's steps for more accurate path
      // The overview_polyline is simplified and may miss turns/curves
      const allCoordinates: { latitude: number; longitude: number }[] = [];
      
      // Helper to check if two coordinates are effectively the same (within ~1 meter)
      const isSamePoint = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
        const threshold = 0.00001; // ~1.1 meters at equator
        return Math.abs(a.latitude - b.latitude) < threshold && 
               Math.abs(a.longitude - b.longitude) < threshold;
      };
      
      for (const leg of data.routes[0].legs) {
        for (const step of leg.steps) {
          const stepCoords = decodePolyline(step.polyline.points);
          if (stepCoords.length === 0) continue;
          
          if (allCoordinates.length > 0) {
            const last = allCoordinates[allCoordinates.length - 1];
            const first = stepCoords[0];
            
            // Skip first point only if it's a duplicate to avoid redundant points
            if (isSamePoint(last, first)) {
              stepCoords.shift();
            }
            // If points aren't the same but are too far apart, we still include all points
            // This ensures no gaps in the polyline
          }
          
          allCoordinates.push(...stepCoords);
        }
      }

      // Also return leg information for distance/duration
      const legs = data.routes[0].legs.map((leg: any) => ({
        distance: leg.distance,
        duration: leg.duration,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
      }));

      res.json({
        coordinates: allCoordinates,
        legs,
        totalDistance: data.routes[0].legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0),
        totalDuration: data.routes[0].legs.reduce((sum: number, leg: any) => sum + leg.duration.value, 0),
      });
    } catch (error) {
      console.error("Error fetching directions:", error);
      res.status(500).json({ error: "Failed to fetch directions" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
