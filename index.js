require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

let config;
try {
    const configFile = fs.readFileSync('config.json', 'utf8');
    config = JSON.parse(configFile);
} catch (error) {
    console.error('Config dosyası okunurken bir hata oluştu:', error);
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const token = process.env.BOT_TOKEN;
const templateUrl = process.env.TEMPLATE_URL;
const ownerID = process.env.OWNERID;

client.once('ready', async () => {
    console.log(`${client.user.tag} ${config.mesajlar.botHazir}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('sunucukur')
            .setDescription('Sunucu kurulumunu yapar.')
    ];

    await client.application.commands.set(commands);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        if (interaction.commandName === 'sunucukur') {
            if (interaction.user.id !== ownerID) {
                return interaction.reply({ content: config.mesajlar.yetkiYok, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(config.mesajlar.kurulumSihirbazi)
                .setDescription(config.mesajlar.kurulumAciklama)
                .setColor(0x00AE86);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm')
                        .setLabel(config.mesajlar.baslaButonu)
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'confirm') {
            const embed = new EmbedBuilder()
                .setTitle(config.mesajlar.kurulumSecenekBaslik)
                .setDescription(config.mesajlar.kurulumSecenekAciklamasi)
                .setColor(0x00AE86);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('copyRoles')
                        .setLabel(config.mesajlar.rolKopyalaButon)
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('copyChannels')
                        .setLabel(config.mesajlar.kanalVeKategoriKopyalaButon)
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('copyAll')
                        .setLabel(config.mesajlar.hepsiniKopyalaButon)
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (interaction.customId === 'copyRoles' || interaction.customId === 'copyChannels' || interaction.customId === 'copyAll') {
            await interaction.deferReply({ ephemeral: true });

            const guild = interaction.guild;
            const user = interaction.user;

            try {
                if (interaction.customId === 'copyRoles' || interaction.customId === 'copyAll') {
                    for (const role of guild.roles.cache.filter(role => role.name !== '@everyone' && role.editable).values()) {
                        try {
                            await role.delete();
                            await new Promise(resolve => setTimeout(resolve, 250));
                        } catch (error) {
                        }
                    }
                }

                if (interaction.customId === 'copyChannels' || interaction.customId === 'copyAll') {
                    for (const channel of guild.channels.cache.values()) {
                        try {
                            await channel.delete();
                            await new Promise(resolve => setTimeout(resolve, 250));
                        } catch (error) {
                        }
                    }
                }

                const templateCode = templateUrl.split('/').pop();
                const response = await axios.get(`https://discord.com/api/v10/guilds/templates/${templateCode}`, {
                    headers: {
                        'Authorization': `Bot ${token}`
                    }
                });

                const templateData = response.data;

                const { serialized_source_guild: { channels, roles } } = templateData;

                const createdRoles = {};
                if (interaction.customId === 'copyRoles' || interaction.customId === 'copyAll') {
                    for (const role of roles.reverse()) {
                        if (role.name !== '@everyone') {
                            const createdRole = await guild.roles.create({
                                name: role.name,
                                color: role.color,
                                permissions: BigInt(role.permissions),
                                hoist: role.hoist,
                                mentionable: role.mentionable
                            });
                            createdRoles[role.id] = createdRole.id;
                        }
                    }
                }

                if (interaction.customId === 'copyChannels' || interaction.customId === 'copyAll') {
                    const categoryChannels = channels.filter(channel => channel.type === 4);
                    const otherChannels = channels.filter(channel => channel.type !== 4);
                    const categoryMapping = {};

                    for (const category of categoryChannels) {
                        try {
                            const permissionOverwrites = category.permission_overwrites.map(overwrite => ({
                                id: createdRoles[overwrite.id] || guild.id,
                                allow: BigInt(overwrite.allow),
                                deny: BigInt(overwrite.deny)
                            }));

                            const createdCategory = await guild.channels.create({
                                name: category.name,
                                type: category.type,
                                permissionOverwrites
                            });
                            categoryMapping[category.id] = createdCategory.id;
                        } catch (error) {
                        }
                    }

                    for (const channel of otherChannels) {
                        try {
                            const permissionOverwrites = channel.permission_overwrites.map(overwrite => ({
                                id: createdRoles[overwrite.id] || guild.id,
                                allow: BigInt(overwrite.allow),
                                deny: BigInt(overwrite.deny)
                            }));

                            await guild.channels.create({
                                name: channel.name,
                                type: channel.type,
                                topic: channel.topic,
                                nsfw: channel.nsfw,
                                bitrate: channel.bitrate,
                                userLimit: channel.user_limit,
                                rateLimitPerUser: channel.rate_limit_per_user,
                                parent: categoryMapping[channel.parent_id] || null,
                                permissionOverwrites
                            });
                        } catch (error) {
                        }
                    }
                }

                let successMessage;
                if (interaction.customId === 'copyRoles') {
                    successMessage = config.mesajlar.rollerKopyalandiMesaj;
                } else if (interaction.customId === 'copyChannels') {
                    successMessage = config.mesajlar.kanallarKopyalandiMesaj;
                } else {
                    successMessage = config.mesajlar.kurulumTamamlandiMesaj;
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle(config.mesajlar.kurulumTamamlandi)
                    .setDescription(`${successMessage}\n\n${config.mesajlar.kurulumSonuAciklama}`)
                    .setColor(0x00AE86);

                const textChannel = guild.channels.cache.find(channel => channel.type === 0);
                if (textChannel) {
                    await textChannel.send({ content: `<@${user.id}>`, embeds: [successEmbed], ephemeral: true });
                }

                await interaction.followUp({ embeds: [successEmbed], ephemeral: true });
            } catch (error) {
                await interaction.followUp({ content: config.mesajlar.hataMesaj, ephemeral: true });
            }
        }
    }
});

client.login(token);
