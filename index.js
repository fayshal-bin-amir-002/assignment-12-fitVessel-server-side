const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174']
}));
app.use(express.json());

const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const secret_access_token = process.env.SECRET_ACCESS_TOKEN;

const stripe = require("stripe")(process.env.STRIPE_SK);


const uri = `mongodb+srv://${user}:${pass}@cluster0.0hiczfr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const database = client.db("fitVesselDB");
        const usersCollection = database.collection("users");
        const testimonialsCollection = database.collection("testimonials");
        const blogsCollection = database.collection("blogs");
        const subscribesCollection = database.collection("subscribes");
        const trainersCollection = database.collection("trainers");
        const classesCollection = database.collection("classes");
        const paymentsCollection = database.collection("payments");
        const slotsCollection = database.collection("slots");


        //<---middleware for verify token--->
        const verifyToken = async (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "Unauthorized Access" });
            }

            const token = req.headers.authorization.split(' ')[1];

            jwt.verify(token, secret_access_token, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ message: "Unauthorized Access" });
                }
                req.decoded = decoded;
                next();
            })
        }

        //<---middleware for verify admin--->
        const verifyAdmin = async (req, res, next) => {
            const user = req.decoded;
            const query = { email: user?.email };
            const result = await usersCollection.findOne(query);
            if (!result || result?.role !== 'admin') {
                return res.status(401).send({ message: "Unauthorized Access" });
            }
            next();
        }

        //<---middleware for verify admin or trainer--->
        const verifyAdminAndTrainer = async (req, res, next) => {
            const user = req.decoded;
            const query = { email: user?.email };
            const result = await usersCollection.findOne(query);
            if (!result || (result?.role !== 'admin' || result?.role !== 'trainer')) {
                return res.status(401).send({ message: "Unauthorized Access" });
            }
            next();
        }

        //<---middleware for verify trainer--->
        const verifyTrainer = async (req, res, next) => {
            const user = req.decoded;
            const query = { email: user?.email };
            const result = await usersCollection.findOne(query);
            if (!result || result?.role !== 'trainer') {
                return res.status(401).send({ message: "Unauthorized Access" });
            }
            next();
        }

        //<---jwt token req--->
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, secret_access_token, { expiresIn: "1h" });
            res.send({ token: token });
        })

        //<---save a user to db--->
        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user?.email };
            const isExist = await usersCollection.findOne(query);

            if (isExist) return res.send({ message: "User already exists!" });

            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        //<---get all testimonials api--->
        app.get("/testimonials", async (req, res) => {
            const result = await testimonialsCollection.find().toArray();
            res.send(result);
        })

        //<---get all blogs api--->
        app.get("/blogs", async (req, res) => {
            const result = await blogsCollection.find().project({ title: 1, author: 1, postDate: 1, image: 1, description: 1 }).limit(6).toArray();
            res.send(result);
        })

        //<---get a single blog data api--->
        app.get("/blog/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await blogsCollection.findOne(query);
            res.send(result);
        })

        //<---get a user role api--->
        app.get("/user/role/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            res.send(result.role);
        })

        //<---save subscribes data in db--->
        app.post("/subscribes", async (req, res) => {
            const subscribeUser = req.body;
            const query = { email: subscribeUser.email };
            const isExists = await subscribesCollection.findOne(query);
            if (isExists) return res.send({ message: 'Already subscribes' });
            const result = await subscribesCollection.insertOne(subscribeUser);
            res.send(result);
        })

        //<---get 3 traines data api--->
        app.get("/teams", async (req, res) => {
            const result = await trainersCollection.find({ status: 'verified' }).project({ name: 1, image: 1, biography: 1, skills: 1, experience: 1 }).limit(3).toArray();
            res.send(result);
        })

        //<---get all trainers data api--->
        app.get("/trainers", async (req, res) => {
            const result = await trainersCollection.find({ status: 'verified' }).toArray();
            res.send(result);
        })

        //<---get a single trainer data api--->
        app.get("/trainer-details/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await trainersCollection.findOne(query);
            res.send(result);
        })

        //<---get top booked featured classes api--->
        app.get("/featured-classes", async (req, res) => {
            const result = await classesCollection.aggregate(
                [{ $sort: { totalBooking: -1 } }]
            ).limit(6).toArray();

            res.send(result);
        })
        //<---get all classes data with the trainer data api--->
        app.get("/classes", async (req, res) => {

            const page = parseInt(req.query.page);

            const totalclass = await classesCollection.countDocuments();

            const result = await classesCollection.aggregate([
                {
                    $lookup: {
                        from: "trainers",
                        let: { skill: "$name" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: ["$$skill", { $map: { input: "$skills", as: "skill", in: "$$skill.value" } }] },
                                            { $eq: ["$status", "verified"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    image: 1
                                }
                            }
                        ],
                        as: "matchedTrainers"
                    }
                },
                {
                    $addFields: {
                        matchedTrainers: { $ifNull: ["$matchedTrainers", []] }
                    }
                }
            ]).skip(page * 6).limit(6).toArray();

            res.send({ result, totalclass });
        })

        //<---api for all community posts--->
        app.get("/community", async (req, res) => {

            const page = parseInt(req.query.page);

            const totalBlogs = await blogsCollection.countDocuments();

            const blogs = await blogsCollection.find().skip(page * 6).limit(6).toArray();

            res.send({ blogs, totalBlogs });
        })

        //<---api for patch a vote of community posts--->
        app.patch("/voteBlog", verifyToken, async (req, res) => {

            const id = req.body.id;
            const vote = req.body.vote;

            const query = { _id: new ObjectId(id) };

            if (vote === 'like') {
                const result = await blogsCollection.updateOne(query, { $inc: { likes: 1 } });
                res.send(result);
            } else {
                const result = await blogsCollection.updateOne(query, { $inc: { dislikes: 1 } });
                res.send(result);
            }
        })

        //<---api for to be a trainer request--->
        app.post("/trainer-request", verifyToken, async (req, res) => {
            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const newTrainer = req.body;
            const email = newTrainer.email;
            const query = { email: email }
            const isExists = await trainersCollection.findOne(query);
            if (isExists && isExists?.status === 'verified') return res.send({ message: 'You are already a trainer.' });
            if (isExists && isExists?.status === 'pending') return res.send({ message: 'Already requested, please wait for admin approval.' });
            const result = await trainersCollection.insertOne(newTrainer);
            res.send(result);
        })

        //<---api for all newsletter subscribers--->
        app.get("/newsletters", verifyToken, verifyAdmin, async (req, res) => {

            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const result = await subscribesCollection.find().toArray();
            res.send(result);
        })

        //<---api for all trainers for dashboard--->
        app.get("/trainers-db", verifyToken, verifyAdmin, async (req, res) => {

            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = { status: 'verified' };

            const options = {
                projection: { email: 1, name: 1, status: 1 }
            };

            const result = await trainersCollection.find(query, options).toArray();
            res.send(result);
        })

        //<---api for all applied trainers for dashboard--->
        app.get("/appliedTrainers", verifyToken, verifyAdmin, async (req, res) => {

            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = { status: 'pending' };

            const result = await trainersCollection.find(query).toArray();
            res.send(result);
        })

        //<---delete a trainer from trainers collection and update role in users collection--->
        app.delete("/trainer-delete/:email", verifyToken, verifyAdmin, async (req, res) => {

            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const email = req.params.email;

            const query = { email: email };

            const updateUser = {
                $set: {
                    role: 'member'
                },
            };

            await usersCollection.updateOne(query, updateUser);

            const result = await trainersCollection.deleteOne(query);

            res.send(result);
        })

        //<---update a user request to be a trainer (accept)--->
        app.patch("/updateAppliedTrainersAccept", verifyToken, verifyAdmin, async (req, res) => {

            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const user = req.body;
            const email = user?.email;
            const query = { email: email };

            const updateDoc1 = {
                $set: {
                    status: 'verified'
                },
            };

            const updateDoc2 = {
                $set: {
                    role: 'trainer'
                },
            };

            await usersCollection.updateOne(query, updateDoc2);
            const result = await trainersCollection.updateOne(query, updateDoc1);

            res.send(result);

        })

        //<---update a user request to be a trainer (reject)--->
        app.patch("/updateAppliedTrainersReject", verifyToken, verifyAdmin, async (req, res) => {

            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const userInfo = req.body;
            const email = userInfo?.email;
            const query = { email: email };

            const updateDoc = {
                $set: {
                    ...userInfo
                },
            };

            const result = await trainersCollection.updateOne(query, updateDoc);

            res.send(result);

        })

        //<---get all classes name--->
        app.get("/classes-name", async (req, res) => {
            const query = {};

            const options = {
                projection: { _id: 0, name: 1, }
            };
            const result = await classesCollection.find(query, options).toArray();
            res.send(result)
        })

        //<---post a new class by admin--->
        app.post("/add-class", verifyToken, verifyAdmin, async (req, res) => {
            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const newclass = req.body;

            const result = await classesCollection.insertOne(newclass);
            res.send(result);
        })

        //<---post a new blog by admin and trainer--->
        app.post("/add-blog", verifyToken, async (req, res) => {
            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const newBlog = req.body;

            const result = await blogsCollection.insertOne(newBlog);
            res.send(result);
        })

        //<---get trainer all data by trainer--->
        app.get("/trainer/:email", verifyToken, verifyTrainer, async (req, res) => {
            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const email = req.params.email;
            const query = { email: email }
            const result = await trainersCollection.findOne(query);
            res.send(result)
        })

        //<---get trainer all data by trainer--->
        app.get("/trainer/:email", verifyToken, verifyTrainer, async (req, res) => {
            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const email = req.params.email;
            const query = { email: email }
            const result = await trainersCollection.findOne(query);
            res.send(result)
        })
        //<---get trainer all data by trainer--->
        app.post("/add-slot", verifyToken, verifyTrainer, async (req, res) => {
            if (req?.decoded?.email !== req.query.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const newSlots = req.body; console.log(newSlots);
            const result = await slotsCollection.insertMany(newSlots);
            res.send(result)
        })

        //<---get all available trainer's added slots--->
        app.get("/trainer-slots/:id", async (req, res) => {
            const id = req.params.id;
            const query = { 'trainer.id': id, status: 'available' };
            const result = await slotsCollection.find(query).toArray();
            res.send(result);
        })

        //<---get all trainer's added slots--->
        app.get("/myadded-slots/:email", verifyToken, verifyTrainer, async (req, res) => {
            const email = req?.query?.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const trainerEmail = req.params.email;
            const query = { 'trainer.email': trainerEmail };
            const result = await slotsCollection.find(query).toArray();
            res.send(result);
        })

        //<---post api for save the payment and increase the class total booking--->
        app.post("/payment", verifyToken, async (req, res) => {
            const email = req?.query?.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const paymentData = req.body; console.log(paymentData);
            const name = paymentData.class.cName;

            // const query1 = { 'class.name': { $regex: name, $options: 'i' } };
            // const query0 = { 'trainer.name': { $regex: trainerName, $options: 'i' } };

            const query = { name: { $regex: name, $options: 'i' } };
            const query0 = { _id: new ObjectId(paymentData.class.sId) };
            const updateSlot = {
                $set: {
                    status: "booked",
                    bookedBy: {
                        name: paymentData.user.name,
                        email: paymentData.user.email
                    }
                },
            };

            await classesCollection.updateOne(query, { $inc: { totalBooking: 1 } });

            await slotsCollection.updateOne(query0, updateSlot);

            const result = await paymentsCollection.insertOne(paymentData);
            res.send(result);
        })

        app.post("/create-payment-intent", verifyToken, async (req, res) => {

            const email = req?.query?.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const { price } = req.body;

            const priceInCent = parseFloat(price) * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: priceInCent,
                currency: "usd",
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        //<----delete a slot by trainer------>
        app.delete("/delete-slot/:id", verifyToken, verifyTrainer, async (req, res) => {
            const email = req?.query?.email;
            const id = req.params.id;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const query = { _id: new ObjectId(id) };
            const result = await slotsCollection.deleteOne(query);
            res.send(result);
        })

        //<----get a applied trainer details by admin------>
        app.get("/applied-trainer-details/:id", verifyToken, verifyAdmin, async (req, res) => {

            const id = req.params.id;

            const query = { _id: new ObjectId(id) };
            const result = await trainersCollection.findOne(query);
            res.send(result);
        })

        //<----get members applied data ------>
        app.get("/active-logs/:email", verifyToken, async (req, res) => {
            if (req?.query?.email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const email = req.params.email;
            const query = {
                email: email
            }
            const result = await trainersCollection.find(query).toArray();
            res.send(result);
        })



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('FitVessel is running')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})