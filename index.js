const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
//Middleware
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.MY_USER}:${process.env.MY_PASSWORD}@cluster0.eow05.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const servicesCollection = client
      .db("doctors-portal")
      .collection("services");
    const bookingsCollection = client
      .db("doctors-portal")
      .collection("bookings");

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });
    //Get All the Booking For a Specific User
    app.get("/booking", async (req, res) => {
      const patient = req.query.patient;
      const query = { patient: patient };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    //Add a Booking
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingsCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingsCollection.insertOne(booking);
      return res.send({ success: true, result });
    });
    //Get Available Booking Slots
    app.get("/available", async (req, res) => {
      const date = req.query.date;
      //Step-1: Get All the Treatments Available
      const services = await servicesCollection.find().toArray();
      //Step-2: Get all the Bookings of the Particular Date
      const query = { date: date };
      const bookings = await bookingsCollection.find(query).toArray();
      //Step:3 Filter out those Services from All Services that are Booked
      services.forEach((service) => {
        //Those Services that are Booked
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        //Get all The Booked Slots
        const bookedSlots = serviceBookings.map((book) => book.slot);
        // Filter Out Those slots that are not booked
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        //Set Service Slots Now(Available Slots)
        service.slots = available;
      });
      res.send(services);
    });
  } finally {
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello from Doctors World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
