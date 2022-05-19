const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { decode } = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.MY_PAYMENT_SECRET);
//Middleware
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.MY_USER}:${process.env.MY_PASSWORD}@cluster0.eow05.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized Access!" });
  }
  //get the token from Auth header by Spliting
  const token = authHeader.split(" ")[1];
  //Verify Token (If it is Correct or not)
  jwt.verify(token, process.env.MY_ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      // if Token is not Correct
      return res.status(403).send({ message: "Forbidden Access" });
    }
    //If token is Right
    req.decoded = decoded;
    console.log(decoded); // bar
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const servicesCollection = client
      .db("doctors-portal")
      .collection("services");
    const bookingsCollection = client
      .db("doctors-portal")
      .collection("bookings");
    const usersCollection = client.db("doctors-portal").collection("users");
    const doctorsCollection = client.db("doctors-portal").collection("doctors");
    const paymentCollection = client.db("doctors-portal").collection("payment");
    //Check whether the user is an Admin or Not Function
    const verifyAdmin = async (req, res, next) => {
      //Requester who want to Make another User an Admin
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Forbidden,You dont have the power" });
      }
    };

    //Get All the services From Database
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });
    //Get All the Booking For a Specific User
    app.get("/booking", verifyJWT, async (req, res) => {
      //Patient Email
      const patient = req.query.patient;
      // const authorization = req.headers.authorization;
      // console.log(authorization);

      // Give the information's to the Exact(Right) user,Dont give other Users Info
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingsCollection.find(query).toArray();
        res.send(bookings);
      } else {
        return res
          .status(403)
          .send({ message: "Forbidden Access! you aren't the right user" });
      }
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
    //Get a Specific Booking Ttreatment Information For Payment
    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    });

    // Update Booking Status after Payment
    app.patch("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedDoc);
    });

    //get all users
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    //Make a specific user to Admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      //The user Whom want to make admin
      const email = req.params.email;
      //Requester who want to Make another User an Admin
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden,You dont have the power" });
      }
    });

    //Check Whether the user is an Admin or Not
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";

      res.send({ admin: isAdmin });
    });
    //Check Whether the user Was Previously logged in or Not
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign({ email: email }, process.env.MY_ACCESS_TOKEN, {
        expiresIn: "7d",
      });
      res.send({ result, token });
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

    //Send Doctors Information's to Data Base
    app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    //Get All the Doctors Informations From Data base
    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const allDoctors = await doctorsCollection.find().toArray();
      res.send(allDoctors);
    });
    //Get a doctor From Data base
    app.delete("/doctors/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const restDoctors = await doctorsCollection.deleteOne(filter);
      res.send(restDoctors);
    });

    //Create Payment intent API(Get client Secret)
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      //Get the Price Amount
      const price = service.price;
      //Convert to Poisha
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
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
